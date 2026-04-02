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
} from '@chanl/scenarios-core';
import { PromptsService } from '../prompts/prompts.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectModel(ScenarioExecution.name)
    private readonly executionModel: Model<ScenarioExecutionDocument>,
    private readonly promptsService: PromptsService,
    private readonly settingsService: SettingsService,
    private readonly agentConfigResolver: AgentConfigResolver,
  ) {}

  private async resolveAgentConfig(promptId: string) {
    const prompt = await this.promptsService.findById(promptId);
    return this.agentConfigResolver.resolve({
      prompt: { content: (prompt as any).content, adapterConfig: (prompt as any).adapterConfig },
      settingsLookup: (provider) => this.settingsService.getApiKey(provider),
    });
  }

  async createSession(dto: { promptId: string }): Promise<{
    sessionId: string;
    executionId: string;
  }> {
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

    // Resolve adapter config from prompt + settings (single source of truth)
    const promptId = execution.promptId?.toString();
    if (!promptId) {
      throw new BadRequestException('Session has no linked prompt');
    }
    const resolved = await this.resolveAgentConfig(promptId);

    // Create adapter, connect, rebuild history from stepResults
    const adapter = this.createAdapter(resolved.adapterType);
    await adapter.connect(resolved.config);

    const history: AgentMessage[] = [];
    for (const step of execution.stepResults || []) {
      if (step.role === 'persona') {
        history.push({ role: 'user', content: step.actualResponse || '' });
      } else if (step.role === 'agent') {
        history.push({ role: 'assistant', content: step.actualResponse || '' });
      }
    }

    const now = new Date();

    try {
      // Send message with full history
      const response = await adapter.sendMessage(trimmed, history);

      // Build step results for this turn
      const turnIndex = Math.floor((history.length + 2) / 2) - 1;
      const newSteps = [
        {
          stepId: `turn-${turnIndex}-persona`,
          status: 'completed' as const,
          role: 'persona' as const,
          actualResponse: trimmed,
          duration: 0,
          startTime: now,
          endTime: now,
        },
        {
          stepId: `turn-${turnIndex}-agent`,
          status: 'completed' as const,
          role: 'agent' as const,
          actualResponse: response.content,
          duration: response.latencyMs || 0,
          startTime: now,
          endTime: new Date(),
          ...(response.toolCalls?.length ? { toolCalls: response.toolCalls } : {}),
        },
      ];

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
