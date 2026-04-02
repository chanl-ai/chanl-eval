import { Processor, Process, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
import { AgentAdapter, AgentMessage, AgentResponse } from '../adapters/agent-adapter.interface';
import { PersonaSimulatorService } from '../simulator/persona-simulator.service';
import { EvaluationService } from '@chanl/scorecards-core';
import { ToolFixtureService } from '../tool-fixtures/tool-fixture.service';
import { MockResolver } from '../tool-fixtures/mock-resolver.service';
import { ToolFixture } from '../tool-fixtures/schemas/tool-fixture.schema';
import {
  generatePersonaOpening,
  generatePersonaUtterance,
} from './persona-llm';
import { buildLlmJudge } from './judge-llm';
import { AgentConfigResolver, PromptConfig } from './agent-config-resolver';
import { resolveLlmConfigSync } from './llm-config-resolver';
import { buildTemplateVariables, renderPersonaTemplate } from './template-renderer';
import { PersonaStrategyRegistry } from './persona-strategy-registry';
import { PersonaStrategyContext } from './persona-strategy.interface';

const MAX_TOOL_CALLS_PER_TURN = 5;

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
    private readonly agentConfigResolver: AgentConfigResolver,
    private readonly personaSimulator: PersonaSimulatorService,
    private readonly evaluationService: EvaluationService,
    private readonly toolFixtureService: ToolFixtureService,
    private readonly mockResolver: MockResolver,
    private readonly personaStrategyRegistry: PersonaStrategyRegistry,
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

      // 3b. Load tool fixtures (if provided)
      let toolFixtures: ToolFixture[] = [];
      if (data.toolFixtureIds?.length) {
        toolFixtures = await this.toolFixtureService.findByIds(data.toolFixtureIds);
        this.logger.debug(
          `Loaded ${toolFixtures.length} tool fixtures for execution ${data.executionId}`,
        );
      }

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
            variables: (typeof persona.variables === 'object' && !Array.isArray(persona.variables))
              ? persona.variables as Record<string, string>
              : undefined,
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

      // 5. Resolve agent config from Prompt entity (or inline fallback)
      const settingsLookup = async (provider: string): Promise<string | undefined> => {
        try {
          const settingsDoc = await this.scenarioModel.db
            .collection('settings')
            .findOne({});
          const providerKeys = (settingsDoc as any)?.providerKeys || {};
          return providerKeys[provider] || undefined;
        } catch {
          return undefined;
        }
      };

      // Load Prompt entity — the agent under test
      if (!data.promptId) {
        throw new Error('No agent configured — promptId is required in the execute request');
      }

      const promptDoc = await this.scenarioModel.db
        .collection('prompts')
        .findOne({ _id: new Types.ObjectId(data.promptId) });
      if (!promptDoc) {
        throw new Error(`Prompt ${data.promptId} not found`);
      }

      const toolDefs = toolFixtures.map((tf) => ({
        name: tf.name,
        description: tf.description,
        parameters: tf.parameters || { type: 'object', properties: {} },
      }));

      const { adapterType, config: adapterConfig } = await this.agentConfigResolver.resolve({
        prompt: promptDoc as unknown as PromptConfig,
        settingsLookup,
        tools: toolDefs,
      });

      const adapter = this.adapterRegistry.getOrThrow(adapterType);
      await adapter.connect(adapterConfig);

      await job.progress(50);

      // 7. Run conversation loop
      const maxTurns = data.maxTurns || DEFAULT_MAX_TURNS;
      const transcript: TranscriptEntry[] = [];
      const history: AgentMessage[] = [];

      // Resolve persona strategy (default, reactive, etc.)
      const strategyType = scenario.personaStrategyType || 'default';
      const personaStrategy = this.personaStrategyRegistry.has(strategyType)
        ? this.personaStrategyRegistry.getOrThrow(strategyType)
        : this.personaStrategyRegistry.getOrThrow('default');

      const makeStrategyCtx = (lastAgentResponse: string, turn: number): PersonaStrategyContext => ({
        personaTraits: personaTraits || { name: 'Customer' },
        systemPrompt: personaSystemPrompt,
        history,
        lastAgentResponse,
        turn,
        transcript,
        scenarioPrompt: scenario.prompt,
        adapterType,
        adapterConfig,
      });

      // Initial persona message (strategy → heuristic fallback)
      let personaMessage =
        (await personaStrategy.generateOpening(makeStrategyCtx('', 0))) ||
        this.getOpeningMessage(scenario.prompt, persona);

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
        let agentResponse: AgentResponse = await adapter.sendMessage(
          personaMessage,
          history,
        );

        // Handle tool calls if the LLM wants to use tools
        const hadToolCalls = !!(agentResponse.toolCalls?.length && toolFixtures.length > 0);
        if (hadToolCalls) {
          // Add persona message to history first — the tool call loop needs
          // the full conversation context when re-calling the LLM
          history.push({ role: 'user', content: personaMessage });

          // resolveToolCallLoop pushes: [assistant+tool_calls, tool_results, ...]
          // and re-calls the LLM until it returns plain text
          agentResponse = await this.resolveToolCallLoop(
            adapter,
            agentResponse,
            toolFixtures,
            history,
            transcript,
          );

          // Add the final text response to history
          history.push({ role: 'assistant', content: agentResponse.content });
        } else {
          // No tool calls — standard history update
          history.push({ role: 'user', content: personaMessage });
          history.push({ role: 'assistant', content: agentResponse.content });
        }

        // Record agent response (final text after any tool call resolution)
        transcript.push({
          role: 'agent',
          content: agentResponse.content,
          timestamp: new Date(),
          latencyMs: agentResponse.latencyMs,
        });

        // Check if conversation should end
        if (this.shouldEndConversation(agentResponse.content, turn, maxTurns)) {
          break;
        }

        // Optional: let strategy update system prompt mid-conversation
        if (personaStrategy.updateSystemPrompt) {
          const updatedPrompt = await personaStrategy.updateSystemPrompt(
            makeStrategyCtx(agentResponse.content, turn),
          );
          if (updatedPrompt) {
            personaSystemPrompt = updatedPrompt;
          }
        }

        const llmNext = await personaStrategy.generateUtterance(
          makeStrategyCtx(agentResponse.content, turn),
        );
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

      this.logger.debug(`Scorecard check: scorecardId=${scenario.scorecardId}, evaluationService=${!!this.evaluationService}`);
      let scorecardSummary: string | undefined;
      if (scenario.scorecardId && this.evaluationService) {
        try {
          // Extract tool calls from transcript for RAG faithfulness evaluation
          const allToolCalls = transcript
            .filter((t) => t.toolCalls?.length)
            .flatMap((t) => t.toolCalls!);

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
              toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
              groundTruth: scenario.groundTruth || undefined,
              llmEvaluate: buildLlmJudge(
                adapterConfig.apiKey
                  ? { kind: (adapterType === 'anthropic' ? 'anthropic' : 'openai') as 'openai' | 'anthropic', apiKey: adapterConfig.apiKey, model: adapterConfig.model }
                  : undefined,
              ),
            },
            { scenarioExecutionId: data.executionId },
          );
          scoreFromScorecard = Math.min(
            100,
            Math.round((evalResult.overallScore || 0) * 10),
          );

          // Generate critical summary from eval results
          this.logger.debug(`Generating eval summary: apiKey=${!!adapterConfig.apiKey}, adapterType=${adapterType}`);
          scorecardSummary = await this.generateEvalSummary(
            evalResult,
            adapterConfig.apiKey,
            adapterType,
          );
          this.logger.debug(`Eval summary: ${scorecardSummary ? scorecardSummary.substring(0, 80) + '...' : 'NONE'}`);
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
              role: entry.role,
              actualResponse: entry.content,
              duration: entry.latencyMs || 0,
              startTime: entry.timestamp,
              endTime: entry.timestamp,
              ...(entry.toolCalls?.length ? { toolCalls: entry.toolCalls } : {}),
            })),
            'metrics.totalSteps': transcript.length,
            'metrics.completedSteps': transcript.length,
            'metrics.failedSteps': 0,
            'metrics.skippedSteps': 0,
            'metrics.responseTime': result.metrics?.avgLatencyMs || 0,
            'metrics.completion': 100,
            'metrics.accuracy': result.score,
            ...(scorecardSummary ? { scorecardSummary } : {}),
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
   * Resolve tool calls in a loop until the LLM returns a text-only response
   * or the iteration limit is reached.
   *
   * Each iteration:
   * 1. Resolves all tool calls via MockResolver
   * 2. Records tool calls in the transcript
   * 3. Adds assistant message (with tool calls) and tool results to history
   * 4. Calls the LLM again with tool results
   *
   * Returns the final AgentResponse (text, no pending tool calls).
   */
  private async resolveToolCallLoop(
    adapter: AgentAdapter,
    initialResponse: AgentResponse,
    toolFixtures: ToolFixture[],
    history: AgentMessage[],
    transcript: TranscriptEntry[],
  ): Promise<AgentResponse> {
    let agentResponse = initialResponse;
    let iteration = 0;

    while (agentResponse.toolCalls?.length && iteration < MAX_TOOL_CALLS_PER_TURN) {
      iteration++;

      // Resolve each tool call via MockResolver
      const resolvedCalls = this.mockResolver.resolveAll(agentResponse.toolCalls, toolFixtures);

      // Record tool calls in transcript
      for (const call of resolvedCalls) {
        transcript.push({
          role: 'tool',
          content: JSON.stringify({
            name: call.name,
            arguments: call.arguments,
            result: call.result,
          }),
          timestamp: new Date(),
          toolCalls: [{
            name: call.name,
            arguments: call.arguments,
            result: call.result,
          }],
        });
      }

      // Let the adapter build the complete history messages (assistant + tool results)
      // Each provider has different format requirements — the adapter owns this
      const historyMessages = adapter.buildToolCallHistory(agentResponse, resolvedCalls);
      history.push(...historyMessages);

      this.logger.debug(
        `Tool call iteration ${iteration}: resolved ${resolvedCalls.length} tool(s), calling LLM again`,
      );

      // Call LLM again with tool results — empty message since context is in history
      agentResponse = await adapter.sendMessage('', history);
    }

    if (iteration >= MAX_TOOL_CALLS_PER_TURN && agentResponse.toolCalls?.length) {
      this.logger.warn(
        `Tool call loop hit max iterations (${MAX_TOOL_CALLS_PER_TURN}), returning last response`,
      );
    }

    return agentResponse;
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
   * Generate a critical 2-3 sentence summary of scorecard results.
   * Uses one LLM call after evaluation to distill findings.
   */
  private async generateEvalSummary(
    evalResult: { overallScore: number; passed: boolean; criteriaResults: Array<{ criteriaName?: string; categoryName?: string; passed: boolean; reasoning?: string }> },
    apiKey: string | undefined,
    adapterType: string,
  ): Promise<string | undefined> {
    try {
      const llmConfig = resolveLlmConfigSync(
        apiKey ? (adapterType === 'anthropic' ? 'anthropic' : 'openai') : undefined,
        apiKey ? { apiKey } : undefined,
      );
      if (!llmConfig) return undefined;

      const failed = evalResult.criteriaResults.filter((c) => !c.passed);
      const passed = evalResult.criteriaResults.filter((c) => c.passed);
      const scorePercent = Math.round(evalResult.overallScore * 10);

      const prompt = `You are a QA analyst summarizing an AI agent evaluation.

Score: ${scorePercent}% (${passed.length}/${evalResult.criteriaResults.length} criteria passed)

Failed criteria:
${failed.length === 0 ? 'None — all criteria passed.' : failed.map((c) => `- ${c.criteriaName} (${c.categoryName}): ${c.reasoning || 'No reasoning'}`).join('\n')}

Passed criteria:
${passed.map((c) => `- ${c.criteriaName} (${c.categoryName})`).join('\n')}

Write a critical 2-3 sentence summary. Focus on what went wrong (if anything) and the most important strengths. Be specific — name the criteria. No filler.`;

      if (llmConfig.kind === 'openai') {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llmConfig.apiKey}` },
          body: JSON.stringify({
            model: llmConfig.model || 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 150,
            temperature: 0.3,
          }),
        });
        if (!res.ok) return undefined;
        const data: any = await res.json();
        return data.choices?.[0]?.message?.content?.trim() || undefined;
      } else if (llmConfig.kind === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': llmConfig.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: llmConfig.model || 'claude-3-5-haiku-20241022',
            max_tokens: 150,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (!res.ok) return undefined;
        const data: any = await res.json();
        return data.content?.[0]?.text?.trim() || undefined;
      }
      return undefined;
    } catch (err: any) {
      this.logger.warn(`Summary generation failed: ${err?.message || err}`);
      return undefined;
    }
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
