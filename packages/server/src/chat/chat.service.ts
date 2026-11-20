import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  ScenarioExecution,
  ScenarioExecutionDocument,
} from '@chanl/scenarios-core';
import {
  AgentAdapter,
  AgentAdapterConfig,
  AgentMessage,
  AgentResponse,
  AgentConfigResolver,
  OpenAIAdapter,
  AnthropicAdapter,
  HttpAdapter,
  ToolFixtureService,
  MockResolver,
  ToolFixture,
} from '@chanl/scenarios-core';
import { PromptsService } from '../prompts/prompts.service';
import { SettingsService } from '../settings/settings.service';

/** Tool rounds per message before the reply is returned as is; matches scenario runs. */
const MAX_TOOL_ROUNDS = 5;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectModel(ScenarioExecution.name)
    private readonly executionModel: Model<ScenarioExecutionDocument>,
    private readonly promptsService: PromptsService,
    private readonly settingsService: SettingsService,
    private readonly agentConfigResolver: AgentConfigResolver,
    private readonly toolFixtureService: ToolFixtureService,
    private readonly mockResolver: MockResolver,
  ) {}

  private async resolveAgentConfig(promptId: string, tools: ToolFixture[] = []) {
    const prompt = await this.promptsService.findById(promptId);
    return this.agentConfigResolver.resolve({
      prompt: { content: prompt.content, adapterConfig: prompt.adapterConfig },
      settingsLookup: (provider) => this.settingsService.getApiKey(provider),
      tools: tools.map((tf) => ({
        name: tf.name,
        description: tf.description,
        parameters: tf.parameters || { type: 'object', properties: {} },
      })),
    });
  }

  /**
   * The session's tools are fixed when it starts and kept on the execution, so every message in the
   * conversation offers the model the same tools. No ids means the agent's own tools, else every
   * active tool, the same default run sets use.
   */
  async createSession(dto: { promptId: string; toolFixtureIds?: string[] }): Promise<{
    sessionId: string;
    executionId: string;
    toolFixtureIds: string[];
  }> {
    const prompt = await this.promptsService.findById(dto.promptId);
    const toolFixtureIds = dto.toolFixtureIds?.length
      ? dto.toolFixtureIds
      : prompt.toolFixtureIds?.length
        ? prompt.toolFixtureIds
        : await this.toolFixtureService.activeIdsForRun();
    const resolved = await this.resolveAgentConfig(dto.promptId);

    // Verify adapter connects (fail fast)
    const adapter = this.createAdapter(resolved.adapterType);
    await adapter.connect(resolved.config);
    await adapter.disconnect();

    // executionId doubles as sessionId
    const executionId = `exec_${randomUUID()}`;

    await this.executionModel.create({
      executionId,
      mode: 'manual',
      promptId: new Types.ObjectId(dto.promptId),
      status: 'running',
      startTime: new Date(),
      triggeredBy: 'playground',
      stepResults: [],
      parameters: {
        adapterType: resolved.adapterType,
        model: resolved.config.model,
        toolFixtureIds,
      },
    });

    this.logger.log(`Chat session created: ${executionId} with ${toolFixtureIds.length} tools`);
    return { sessionId: executionId, executionId, toolFixtureIds };
  }

  async sendMessage(
    sessionId: string,
    message: string,
  ): Promise<{
    content: string;
    latencyMs?: number;
    toolCalls: Array<{ name: string; arguments: Record<string, any>; result: any }>;
  }> {
    const trimmed = message.trim();
    if (!trimmed) {
      throw new BadRequestException('Message cannot be empty');
    }

    // Load execution from DB
    const execution = await this.executionModel.findOne({ executionId: sessionId });
    if (!execution) {
      throw new NotFoundException(`Chat session ${sessionId} not found`);
    }
    if (execution.status !== 'running') {
      throw new BadRequestException(`Chat session ${sessionId} has already ended`);
    }

    // Resolve adapter config from prompt + settings (single source of truth)
    const promptId = execution.promptId?.toString();
    if (!promptId) {
      throw new BadRequestException('Session has no linked prompt');
    }
    const toolIds: string[] = execution.parameters?.toolFixtureIds || [];
    const tools = toolIds.length ? await this.toolFixtureService.findByIds(toolIds) : [];
    const resolved = await this.resolveAgentConfig(promptId, tools);

    const adapter = this.createAdapter(resolved.adapterType);
    await adapter.connect(resolved.config);

    // Earlier tool rounds are replayed as plain assistant text: the provider-specific tool-call ids
    // are not stored, and the model only needs to know what each tool returned.
    const history: AgentMessage[] = [];
    for (const step of execution.stepResults || []) {
      if (step.role === 'persona') {
        history.push({ role: 'user', content: step.actualResponse || '' });
      } else if (step.role === 'agent') {
        history.push({ role: 'assistant', content: step.actualResponse || '' });
      } else if (step.role === 'tool') {
        for (const call of step.toolCalls || []) {
          history.push({
            role: 'assistant',
            content: `[Called ${call.name}(${JSON.stringify(call.arguments ?? {})}) → ${JSON.stringify(call.result)}]`,
          });
        }
      }
    }

    const now = new Date();
    const turnIndex = (execution.stepResults || []).filter((st) => st.role === 'persona').length;

    try {
      let response = await adapter.sendMessage(trimmed, history);
      const toolCalls: Array<{ name: string; arguments: Record<string, any>; result: any }> = [];

      // Same loop as a scenario run: resolve each call against the mock tools and send the results
      // back until the model answers in text.
      if (response.toolCalls?.length && tools.length) {
        history.push({ role: 'user', content: trimmed });
        for (let round = 0; response.toolCalls?.length && round < MAX_TOOL_ROUNDS; round++) {
          const resolvedCalls = this.mockResolver.resolveAll(response.toolCalls, tools);
          for (const call of resolvedCalls) {
            toolCalls.push({ name: call.name, arguments: call.arguments, result: call.result });
          }
          history.push(...adapter.buildToolCallHistory(response, resolvedCalls));
          response = await adapter.sendMessage('', history);
        }
      }

      const steps: any[] = [
        {
          stepId: `turn-${turnIndex}-persona`,
          status: 'completed' as const,
          role: 'persona' as const,
          actualResponse: trimmed,
          duration: 0,
          startTime: now,
          endTime: now,
        },
        ...toolCalls.map((call, i) => ({
          stepId: `turn-${turnIndex}-tool-${i}`,
          status: 'completed' as const,
          role: 'tool' as const,
          actualResponse: JSON.stringify(call),
          duration: 0,
          startTime: now,
          endTime: now,
          toolCalls: [call],
        })),
        {
          stepId: `turn-${turnIndex}-agent`,
          status: 'completed' as const,
          role: 'agent' as const,
          actualResponse: response.content,
          duration: response.latencyMs || 0,
          startTime: now,
          endTime: new Date(),
        },
      ];

      await this.executionModel.findOneAndUpdate(
        { executionId: sessionId },
        { $push: { stepResults: { $each: steps } } },
      );

      return {
        content: response.content,
        latencyMs: response.latencyMs,
        toolCalls,
      };
    } finally {
      await adapter.disconnect();
    }
  }

  async endSession(sessionId: string): Promise<any> {
    const execution = await this.executionModel.findOneAndUpdate(
      { executionId: sessionId },
      { $set: { status: 'completed', endTime: new Date() } },
      { new: true },
    );

    if (!execution) {
      throw new NotFoundException(`Execution ${sessionId} not found`);
    }

    this.logger.log(`Chat session ended: ${sessionId}`);
    return execution;
  }

  async getActiveSession(): Promise<{ sessionId: string; execution: any } | null> {
    // Find the last manual execution that's still running
    const execution = await this.executionModel.findOne(
      { mode: 'manual', status: 'running' },
      null,
      { sort: { createdAt: -1 } },
    );
    if (!execution) return null;

    return { sessionId: execution.executionId, execution };
  }

  async getSession(sessionId: string): Promise<any> {
    const execution = await this.executionModel.findOne({ executionId: sessionId });
    if (!execution) {
      throw new NotFoundException(`Execution ${sessionId} not found`);
    }
    return execution;
  }

  private createAdapter(type: string): AgentAdapter {
    switch (type) {
      case 'openai':
        return new OpenAIAdapter();
      case 'anthropic':
        return new AnthropicAdapter();
      case 'http':
        return new HttpAdapter();
      default:
        throw new BadRequestException(`Unknown adapter type: ${type}`);
    }
  }
}
