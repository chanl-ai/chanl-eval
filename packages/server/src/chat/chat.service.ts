import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  ScenarioExecution,
  ScenarioExecutionDocument,
  ToolFixtureService,
  MockResolver,
} from '@chanl/scenarios-core';
import {
  AgentAdapter,
  AgentMessage,
  AgentResponse,
  OpenAIAdapter,
  AnthropicAdapter,
  HttpAdapter,
} from '@chanl/scenarios-core';
import { resolveLlmConfig } from '@chanl/scenarios-core';
import { PromptsService } from '../prompts/prompts.service';
import { SettingsService } from '../settings/settings.service';

const MAX_TOOL_CALLS_PER_TURN = 5;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectModel(ScenarioExecution.name)
    private readonly executionModel: Model<ScenarioExecutionDocument>,
    private readonly promptsService: PromptsService,
    private readonly settingsService: SettingsService,
    private readonly toolFixtureService: ToolFixtureService,
    private readonly mockResolver: MockResolver,
  ) {}

  async createSession(dto: {
    promptId: string;
    toolFixtureIds?: string[];
  }): Promise<{
    sessionId: string;
    executionId: string;
  }> {
    // Validate prompt and settings exist
    const prompt = await this.promptsService.findById(dto.promptId);
    const promptAny = prompt as any;
    const adapterConfig = promptAny.adapterConfig || {};
    const adapterType = adapterConfig.adapterType || 'openai';

    // Resolve API key via central 4-tier chain (config → legacy → env → settings DB)
    const settingsLookup = async (provider: string) => this.settingsService.getApiKey(provider);
    const resolvedConfig = await resolveLlmConfig(adapterType, adapterConfig, settingsLookup);
    if (!resolvedConfig) {
      throw new BadRequestException(
        `No API key configured for provider "${adapterType}". Set it in Settings or CHANL_OPENAI_API_KEY env var.`,
      );
    }
    const apiKey = resolvedConfig.apiKey;

    // Load tool fixtures if provided
    const toolFixtureIds = dto.toolFixtureIds || [];
    let toolDefs: any[] = [];
    if (toolFixtureIds.length > 0) {
      const fixtures = await this.toolFixtureService.findByIds(toolFixtureIds);
      toolDefs = fixtures.map((tf: any) => ({
        name: tf.name,
        description: tf.description,
        parameters: tf.parameters || { type: 'object', properties: {} },
      }));
    }

    // Verify adapter connects (fail fast)
    const adapter = this.createAdapter(adapterType);
    await adapter.connect({
      apiKey,
      model: adapterConfig.model,
      temperature: adapterConfig.temperature,
      maxTokens: adapterConfig.maxTokens,
      systemPrompt: promptAny.content,
      ...(toolDefs.length > 0 ? { tools: toolDefs } : {}),
    });
    await adapter.disconnect();

    // executionId doubles as sessionId
    const executionId = `exec_${randomUUID()}`;

    await this.executionModel.create({
      executionId,
      mode: 'manual',
      promptId: new Types.ObjectId(dto.promptId),
      status: 'running',
      startTime: new Date(),
      triggeredBy: `Manual Chat: ${promptAny.name || 'Untitled'}`,
      stepResults: [],
      parameters: {
        adapterType,
        model: adapterConfig.model,
        toolFixtureIds,
      },
    });

    this.logger.log(`Chat session created: ${executionId}`);
    return { sessionId: executionId, executionId };
  }

  async sendMessage(
    sessionId: string,
    message: string,
  ): Promise<{
    content: string;
    latencyMs?: number;
    toolCalls?: AgentResponse['toolCalls'];
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

    // Load prompt + settings to reconnect adapter
    const promptId = execution.promptId?.toString();
    if (!promptId) {
      throw new BadRequestException('Session has no linked prompt');
    }
    const prompt = await this.promptsService.findById(promptId);
    const promptAny = prompt as any;
    const adapterConfig = promptAny.adapterConfig || {};
    const adapterType = adapterConfig.adapterType || 'openai';

    // Resolve API key via central 4-tier chain
    const settingsLookup = async (provider: string) => this.settingsService.getApiKey(provider);
    const resolvedCfg = await resolveLlmConfig(adapterType, adapterConfig, settingsLookup);
    if (!resolvedCfg) {
      throw new BadRequestException(`No API key for "${adapterType}". Set it in Settings or CHANL_OPENAI_API_KEY env var.`);
    }
    const apiKey = resolvedCfg.apiKey;

    // Load tool fixtures if session has them
    const toolFixtureIds = (execution.parameters as any)?.toolFixtureIds || [];
    let toolFixtures: any[] = [];
    let toolDefs: any[] = [];
    if (toolFixtureIds.length > 0) {
      toolFixtures = await this.toolFixtureService.findByIds(toolFixtureIds);
      toolDefs = toolFixtures.map((tf: any) => ({
        name: tf.name,
        description: tf.description,
        parameters: tf.parameters || { type: 'object', properties: {} },
      }));
    }

    // Create adapter, connect, rebuild history from stepResults
    const adapter = this.createAdapter(adapterType);
    await adapter.connect({
      apiKey,
      model: adapterConfig.model,
      temperature: adapterConfig.temperature,
      maxTokens: adapterConfig.maxTokens,
      systemPrompt: promptAny.content,
      ...(toolDefs.length > 0 ? { tools: toolDefs } : {}),
    });

    const history: AgentMessage[] = [];
    for (const step of execution.stepResults || []) {
      if (step.role === 'persona') {
        history.push({ role: 'user', content: step.actualResponse || '' });
      } else if (step.role === 'agent') {
        history.push({ role: 'assistant', content: step.actualResponse || '' });
      }
    }

    const now = new Date();
    const newSteps: any[] = [];

    try {
      // Send message with full history
      let response = await adapter.sendMessage(trimmed, history);

      // Handle tool calls if fixtures are configured
      if (response.toolCalls?.length && toolFixtures.length > 0) {
        history.push({ role: 'user', content: trimmed });

        let iteration = 0;
        while (response.toolCalls?.length && iteration < MAX_TOOL_CALLS_PER_TURN) {
          iteration++;
          const resolvedCalls = this.mockResolver.resolveAll(response.toolCalls, toolFixtures);

          // Record tool calls in steps
          for (const call of resolvedCalls) {
            newSteps.push({
              stepId: `tool-${randomUUID().slice(0, 8)}`,
              status: 'completed',
              role: 'tool',
              actualResponse: JSON.stringify({ name: call.name, arguments: call.arguments, result: call.result }),
              duration: 0,
              startTime: now,
              endTime: now,
              toolCalls: [{ name: call.name, arguments: call.arguments, result: call.result }],
            });
          }

          const historyMessages = adapter.buildToolCallHistory(response, resolvedCalls);
          history.push(...historyMessages);
          response = await adapter.sendMessage('', history);
        }

        history.push({ role: 'assistant', content: response.content });
      } else {
        history.push({ role: 'user', content: trimmed });
        history.push({ role: 'assistant', content: response.content });
      }

      // Build step results for this turn
      const turnIndex = Math.floor(history.length / 2) - 1;
      newSteps.unshift({
        stepId: `turn-${turnIndex}-persona`,
        status: 'completed',
        role: 'persona',
        actualResponse: trimmed,
        duration: 0,
        startTime: now,
        endTime: now,
      });
      newSteps.push({
        stepId: `turn-${turnIndex}-agent`,
        status: 'completed',
        role: 'agent',
        actualResponse: response.content,
        duration: response.latencyMs || 0,
        startTime: now,
        endTime: new Date(),
        ...(response.toolCalls?.length ? { toolCalls: response.toolCalls } : {}),
      });

      // Append to execution stepResults
      await this.executionModel.findOneAndUpdate(
        { executionId: sessionId },
        { $push: { stepResults: { $each: newSteps } } },
      );

      return {
        content: response.content,
        latencyMs: response.latencyMs,
        toolCalls: response.toolCalls,
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
