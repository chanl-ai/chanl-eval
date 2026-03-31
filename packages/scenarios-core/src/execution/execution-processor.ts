import { Processor, Process, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job } from 'bull';
import { QUEUE_NAMES, DEFAULT_MAX_TURNS } from './queues.config';
import {
  ScenarioExecutionJobData,
  ScenarioExecutionResult,
  TranscriptEntry,
} from './interfaces/job-data.interface';
import {
  ScenarioExecution,
  ScenarioExecutionDocument,
} from '../scenarios/schemas/scenario-execution.schema';
import { Scenario, ScenarioDocument } from '../scenarios/schemas/scenario.schema';
import { Persona, PersonaDocument } from '../personas/schemas/persona.schema';
import { AdapterRegistry } from '../adapters/adapter-registry';
import { AgentMessage } from '../adapters/agent-adapter.interface';
import { PersonaSimulatorService } from '../simulator/persona-simulator.service';
import { EvaluationService } from '@chanl/scorecards-core';
import {
  generatePersonaOpening,
  generatePersonaUtterance,
  resolvePersonaLlmKey,
} from './persona-llm';
import { buildOpenAiJudge } from './judge-llm';
import { buildTemplateVariables, renderPersonaTemplate } from './template-renderer';

@Processor(QUEUE_NAMES.SCENARIO_EXECUTION)
export class ExecutionProcessor {
  private readonly logger = new Logger(ExecutionProcessor.name);

  constructor(
    @InjectModel(ScenarioExecution.name)
    private executionModel: Model<ScenarioExecutionDocument>,
    @InjectModel(Scenario.name)
    private scenarioModel: Model<ScenarioDocument>,
    @InjectModel(Persona.name)
    private personaModel: Model<PersonaDocument>,
    private readonly adapterRegistry: AdapterRegistry,
    private readonly personaSimulator: PersonaSimulatorService,
    private readonly evaluationService: EvaluationService,
  ) {}

  /**
   * Main job handler. Dequeues, runs the conversation loop, and stores results.
   */
  @Process('execute')
  async processExecution(
    job: Job<ScenarioExecutionJobData>,
  ): Promise<ScenarioExecutionResult> {
    const { data } = job;
    const startTime = Date.now();

    this.logger.log(
      `Processing execution ${data.executionId} for scenario ${data.scenarioId}`,
    );

    try {
      await job.progress(5);

      // 1. Update status to running
      await this.executionModel.findOneAndUpdate(
        { executionId: data.executionId },
        { $set: { status: 'running', startTime: new Date() } },
      );

      await job.progress(10);

      // 2. Load scenario
      const scenario = await this.scenarioModel.findById(data.scenarioId);
      if (!scenario) {
        throw new Error(`Scenario ${data.scenarioId} not found`);
      }

      await job.progress(20);

      // 3. Load persona
      const personaId =
        data.personaId || scenario.personaIds?.[0]?.toString();
      const persona = personaId
        ? await this.personaModel.findById(personaId)
        : null;

      await job.progress(30);

      // 4. Generate persona system prompt
      // Priority: Liquid template (if set) → code-generated → scenario prompt fallback
      const personaTraits = persona
        ? {
            name: persona.name,
            emotion: persona.emotion,
            speechStyle: persona.speechStyle,
            intentClarity: persona.intentClarity,
            backgroundNoise: persona.backgroundNoise,
            description: persona.description,
            backstory: persona.backstory,
            gender: persona.gender,
            language: persona.language,
            accent: persona.accent,
            behavior: persona.behavior,
            conversationTraits: persona.conversationTraits,
          }
        : null;

      let personaSystemPrompt: string;
      if (scenario.promptTemplate && personaTraits) {
        // Try Liquid template first — falls back to code-generated on failure
        const templateVars = buildTemplateVariables(personaTraits, scenario.prompt, {
          name: scenario.name,
          description: scenario.description,
          category: scenario.category,
          difficulty: scenario.difficulty,
          promptVariables: scenario.promptVariables,
        });
        const rendered = await renderPersonaTemplate(scenario.promptTemplate, templateVars);
        personaSystemPrompt = rendered || this.personaSimulator.toSystemPrompt(personaTraits, scenario.prompt);
      } else if (personaTraits) {
        personaSystemPrompt = this.personaSimulator.toSystemPrompt(personaTraits, scenario.prompt);
      } else {
        personaSystemPrompt = scenario.prompt;
      }

      await job.progress(40);

      // 5. Get adapter
      const adapterType = data.adapterType || 'http';
      const adapter = this.adapterRegistry.getOrThrow(adapterType);

      // 6. Connect adapter
      await adapter.connect({
        ...data.adapterConfig,
      });

      await job.progress(50);

      // 7. Run conversation loop
      const maxTurns = data.maxTurns || DEFAULT_MAX_TURNS;
      const transcript: TranscriptEntry[] = [];
      const history: AgentMessage[] = [];

      // Initial persona message (LLM when keys allow, else heuristic)
      let personaMessage =
        (await generatePersonaOpening({
          personaSystemPrompt,
          scenarioPrompt: scenario.prompt,
          adapterType: data.adapterType,
          adapterConfig: data.adapterConfig,
        })) || this.getOpeningMessage(scenario.prompt, persona);

      for (let turn = 0; turn < maxTurns; turn++) {
        const turnProgress = 50 + Math.round((turn / maxTurns) * 40);
        await job.progress(turnProgress);

        // Record persona message in transcript
        transcript.push({
          role: 'persona',
          content: personaMessage,
          timestamp: new Date(),
        });

        // Send to agent adapter
        const agentResponse = await adapter.sendMessage(
          personaMessage,
          history,
        );

        // Record agent response
        transcript.push({
          role: 'agent',
          content: agentResponse.content,
          timestamp: new Date(),
          latencyMs: agentResponse.latencyMs,
        });

        // Update history for context
        history.push({ role: 'user', content: personaMessage });
        history.push({ role: 'assistant', content: agentResponse.content });

        // Check if conversation should end
        if (this.shouldEndConversation(agentResponse.content, turn, maxTurns)) {
          break;
        }

        const llmNext = await generatePersonaUtterance({
          personaSystemPrompt,
          history,
          adapterType: data.adapterType,
          adapterConfig: data.adapterConfig,
        });
        personaMessage =
          llmNext ||
          this.generateNextPersonaMessage(personaSystemPrompt, history, turn);
      }

      // 8. Disconnect adapter
      await adapter.disconnect();

      await job.progress(90);

      // 9. Scorecard evaluation (optional)
      const duration = Date.now() - startTime;
      let scoreFromScorecard: number | undefined;
      const transcriptText = transcript
        .map((e) =>
          e.role === 'agent' ? `Agent: ${e.content}` : `Customer: ${e.content}`,
        )
        .join('\n');

      if (scenario.scorecardId && this.evaluationService) {
        try {
          const judgeKey = resolvePersonaLlmKey(
            data.adapterType,
            data.adapterConfig,
          );
          const openAiKeyForJudge =
            judgeKey?.kind === 'openai'
              ? judgeKey.apiKey
              : data.adapterConfig?.openaiApiKey ||
                (data.adapterType === 'openai'
                  ? data.adapterConfig?.apiKey
                  : undefined);

          const evalResult = await this.evaluationService.evaluate(
            scenario.scorecardId.toString(),
            {
              transcriptText,
              segments: transcript.map((t) => ({
                speaker: t.role === 'agent' ? 'agent' : 'customer',
                text: t.content,
              })),
              metrics: {
                firstResponseLatency:
                  (transcript.find((x) => x.role === 'agent')?.latencyMs ||
                    0) / 1000,
              },
              llmEvaluate: buildOpenAiJudge(
                typeof openAiKeyForJudge === 'string'
                  ? openAiKeyForJudge
                  : undefined,
              ),
            },
            { scenarioExecutionId: data.executionId },
          );
          scoreFromScorecard = Math.min(
            100,
            Math.round((evalResult.overallScore || 0) * 10),
          );
        } catch (err: any) {
          this.logger.warn(
            `Scorecard evaluation skipped or failed: ${err?.message || err}`,
          );
        }
      }

      // 10. Calculate results
      const engagementScore = this.calculateScore(transcript);
      const result: ScenarioExecutionResult = {
        passed: true,
        score: scoreFromScorecard ?? engagementScore,
        duration,
        transcript,
        metrics: {
          totalTurns: Math.ceil(transcript.length / 2),
          avgLatencyMs: this.calculateAvgLatency(transcript),
        },
      };

      // 11. Update execution with results
      await this.executionModel.findOneAndUpdate(
        { executionId: data.executionId },
        {
          $set: {
            status: 'completed',
            endTime: new Date(),
            duration,
            overallScore: result.score,
            stepResults: transcript.map((entry, idx) => ({
              stepId: `turn-${Math.floor(idx / 2)}-${entry.role}`,
              status: 'completed' as const,
              actualResponse: entry.content,
              duration: entry.latencyMs || 0,
              startTime: entry.timestamp,
              endTime: entry.timestamp,
            })),
            'metrics.totalSteps': transcript.length,
            'metrics.completedSteps': transcript.length,
            'metrics.failedSteps': 0,
            'metrics.skippedSteps': 0,
            'metrics.responseTime': result.metrics?.avgLatencyMs || 0,
            'metrics.completion': 100,
            'metrics.accuracy': result.score,
          },
        },
      );

      await job.progress(100);

      this.logger.log(
        `Execution ${data.executionId} completed: score=${result.score}, turns=${result.metrics?.totalTurns}`,
      );

      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Execution ${data.executionId} failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Update execution status to failed
      await this.executionModel.findOneAndUpdate(
        { executionId: data.executionId },
        {
          $set: {
            status: 'failed',
            endTime: new Date(),
            duration: Date.now() - startTime,
          },
          $push: {
            errorMessages: message,
          },
        },
      );

      throw error;
    }
  }

  /**
   * Generate an opening message based on the scenario prompt and persona.
   */
  private getOpeningMessage(
    prompt: string,
    persona: PersonaDocument | null,
  ): string {
    // Use the scenario prompt as the basis for the opening message.
    // In a full implementation, an LLM with persona system prompt would
    // generate a natural opening line.
    if (persona?.description) {
      return `Hi, ${prompt}`;
    }
    return prompt;
  }

  /**
   * Generate the next persona message in the conversation.
   * Placeholder implementation -- a real system would call an LLM with
   * the persona system prompt and conversation history.
   */
  private generateNextPersonaMessage(
    _systemPrompt: string,
    history: AgentMessage[],
    turn: number,
  ): string {
    // Simple follow-up; real implementation uses LLM
    const lastAgent = history[history.length - 1]?.content || '';
    if (turn === 0) {
      return 'Can you tell me more about that?';
    }
    if (lastAgent.toLowerCase().includes('anything else')) {
      return 'No, that is all. Thank you!';
    }
    return 'I see. Can you help me with that?';
  }

  /**
   * Determine whether the conversation should end.
   */
  private shouldEndConversation(
    agentResponse: string,
    turn: number,
    maxTurns: number,
  ): boolean {
    // End on last turn
    if (turn >= maxTurns - 1) return true;

    // End if agent signals completion
    const endPhrases = [
      'goodbye',
      'have a great day',
      'is there anything else',
      'thank you for calling',
    ];
    const lower = agentResponse.toLowerCase();
    return endPhrases.some((phrase) => lower.includes(phrase));
  }

  /**
   * Calculate a basic score based on transcript completeness.
   */
  private calculateScore(transcript: TranscriptEntry[]): number {
    if (transcript.length === 0) return 0;

    // Basic scoring: more turns = better engagement, capped at 100
    const turns = Math.ceil(transcript.length / 2);
    const baseScore = Math.min(turns * 20, 80);

    // Check that all messages have content
    const allHaveContent = transcript.every(
      (entry) => entry.content && entry.content.length > 0,
    );
    const contentBonus = allHaveContent ? 20 : 0;

    return Math.min(baseScore + contentBonus, 100);
  }

  /**
   * Calculate average latency from agent responses.
   */
  private calculateAvgLatency(transcript: TranscriptEntry[]): number {
    const agentEntries = transcript.filter(
      (e) => e.role === 'agent' && e.latencyMs !== undefined,
    );
    if (agentEntries.length === 0) return 0;
    const total = agentEntries.reduce((sum, e) => sum + (e.latencyMs || 0), 0);
    return Math.round(total / agentEntries.length);
  }

  @OnQueueActive()
  onActive(job: Job<ScenarioExecutionJobData>) {
    this.logger.debug(
      `Job ${job.id} started for execution ${job.data.executionId}`,
    );
  }

  @OnQueueCompleted()
  onCompleted(job: Job<ScenarioExecutionJobData>) {
    this.logger.log(
      `Job ${job.id} completed for execution ${job.data.executionId}`,
    );
  }

  @OnQueueFailed()
  onFailed(job: Job<ScenarioExecutionJobData>, error: Error) {
    this.logger.error(
      `Job ${job.id} failed for execution ${job.data.executionId}: ${error.message}`,
      error.stack,
    );
  }
}
