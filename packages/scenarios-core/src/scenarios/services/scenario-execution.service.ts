import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  ScenarioExecution,
  ScenarioExecutionDocument,
} from '../schemas/scenario-execution.schema';
import { Scenario, ScenarioDocument } from '../schemas/scenario.schema';
import {
  ExecuteScenarioDto,
  RetryExecutionDto,
  EvaluateExecutionDto,
} from '../dto/execute-scenario.dto';
import { QueueProducerService } from '../../execution/queue-producer.service';
import { EvaluationService } from '@chanl/scorecards-core';
import { buildLlmJudge } from '../../execution/judge-llm';
import { resolveLlmConfigSync } from '../../execution/llm-config-resolver';

@Injectable()
export class ScenarioExecutionService {
  private readonly logger = new Logger(ScenarioExecutionService.name);

  constructor(
    @InjectModel(ScenarioExecution.name)
    private executionModel: Model<ScenarioExecutionDocument>,
    @InjectModel(Scenario.name)
    private scenarioModel: Model<ScenarioDocument>,
    private readonly queueProducer: QueueProducerService,
    private readonly evaluationService: EvaluationService,
  ) {}

  /**
   * Create and queue a scenario execution.
   * Note: actual queue processing will be wired up by the execution engine (Task 4).
   */
  async execute(
    scenarioId: string,
    executeDto: ExecuteScenarioDto,
  ): Promise<ScenarioExecution> {
    try {
      // Verify scenario exists and is active
      const scenario = await this.scenarioModel.findById(scenarioId);
      if (!scenario) {
        throw new NotFoundException(
          `Scenario with ID ${scenarioId} not found`,
        );
      }

      if (scenario.status !== 'active') {
        throw new BadRequestException(
          `Cannot execute scenario with status "${scenario.status}". Scenario must be active.`,
        );
      }

      // Create execution record
      const executionId = `exec_${randomUUID()}`;
      const executionData: any = {
        executionId,
        scenarioId: new Types.ObjectId(scenarioId),
        promptId: new Types.ObjectId(executeDto.promptId),
        personaId: executeDto.personaId
          ? new Types.ObjectId(executeDto.personaId)
          : scenario.personaIds?.[0],
        scorecardId: executeDto.scorecardId
          ? new Types.ObjectId(executeDto.scorecardId)
          : scenario.scorecardId,
        triggerId: executeDto.triggerId
          ? new Types.ObjectId(executeDto.triggerId)
          : undefined,
        status: 'queued',
        startTime: new Date(),
        triggeredBy: 'system',
        parameters: executeDto.parameters || {},
        environment: {
          version: '1.0.0',
          environment: executeDto.environment || 'development',
        },
      };

      const execution = new this.executionModel(executionData);
      const savedExecution = await execution.save();

      // Enqueue the BullMQ job for the execution processor
      await this.queueProducer.enqueueExecution(executionId, scenarioId, {
        promptId: executeDto.promptId,
        personaId:
          executeDto.personaId || scenario.personaIds?.[0]?.toString(),
        parameters: executeDto.parameters,
        toolFixtureIds: executeDto.toolFixtureIds,
      });

      this.logger.log(
        `Created and enqueued execution ${executionId} for scenario ${scenarioId}`,
      );

      return savedExecution.toJSON();
    } catch (error: any) {
      this.logger.error(
        `Failed to queue execution: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get execution by executionId
   */
  async findOne(
    executionId: string,
  ): Promise<ScenarioExecution> {
    try {
      // Accept both MongoDB _id (24-char hex) and executionId (exec_uuid)
      const isObjectId = /^[a-f0-9]{24}$/.test(executionId);
      const execution = isObjectId
        ? await this.executionModel.findById(executionId)
        : await this.executionModel.findOne({ executionId });

      if (!execution) {
        throw new NotFoundException(
          `Execution with ID ${executionId} not found`,
        );
      }

      return execution.toJSON();
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to find execution: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get executions for a specific scenario
   */
  async findByScenario(
    scenarioId: string,
    pagination?: { limit?: number; offset?: number },
  ): Promise<{ executions: ScenarioExecution[]; total: number }> {
    try {
      const query: any = {
        scenarioId: new Types.ObjectId(scenarioId),
      };

      let queryBuilder = this.executionModel
        .find(query)
        .sort({ startTime: -1 });

      if (pagination?.offset)
        queryBuilder = queryBuilder.skip(pagination.offset);
      if (pagination?.limit)
        queryBuilder = queryBuilder.limit(pagination.limit);

      const executions = await queryBuilder.exec();
      const total = await this.executionModel.countDocuments(query);

      return {
        executions: executions.map((e) => e.toJSON()),
        total,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to find scenario executions: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get all executions with filters
   */
  async findAll(
    filters?: {
      scenarioId?: string;
      agentId?: string;
      personaId?: string;
      status?: string;
      triggerId?: string;
      triggeredBy?: string;
      fromDate?: string;
      toDate?: string;
      minScore?: number;
      maxScore?: number;
    },
    pagination?: { limit?: number; offset?: number },
  ): Promise<{ executions: ScenarioExecution[]; total: number }> {
    try {
      const query: any = {};

      if (filters) {
        if (filters.scenarioId) {
          query.scenarioId = new Types.ObjectId(filters.scenarioId);
        }
        if (filters.agentId) {
          query.agentId = new Types.ObjectId(filters.agentId);
        }
        if (filters.personaId) {
          query.personaId = new Types.ObjectId(filters.personaId);
        }
        if (filters.status) {
          query.status = filters.status;
        }
        if (filters.triggerId) {
          query.triggerId = new Types.ObjectId(filters.triggerId);
        }
        if (filters.triggeredBy) {
          query.triggeredBy = filters.triggeredBy;
        }
        if (filters.fromDate || filters.toDate) {
          query.startTime = {};
          if (filters.fromDate) {
            query.startTime.$gte = new Date(filters.fromDate);
          }
          if (filters.toDate) {
            query.startTime.$lte = new Date(filters.toDate);
          }
        }
        if (
          filters.minScore !== undefined ||
          filters.maxScore !== undefined
        ) {
          query.overallScore = {};
          if (filters.minScore !== undefined) {
            query.overallScore.$gte = filters.minScore;
          }
          if (filters.maxScore !== undefined) {
            query.overallScore.$lte = filters.maxScore;
          }
        }
      }

      let queryBuilder = this.executionModel
        .find(query)
        .sort({ startTime: -1 });

      if (pagination?.offset)
        queryBuilder = queryBuilder.skip(pagination.offset);
      if (pagination?.limit)
        queryBuilder = queryBuilder.limit(pagination.limit);

      const executions = await queryBuilder.exec();
      const total = await this.executionModel.countDocuments(query);

      return {
        executions: executions.map((e) => e.toJSON()),
        total,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to find executions: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Update execution status
   */
  async updateStatus(
    executionId: string,
    status: string,
    updates?: Partial<ScenarioExecution>,
  ): Promise<ScenarioExecution> {
    try {
      const updateData: any = {
        status,
        updatedAt: new Date(),
        ...updates,
      };

      if (
        ['completed', 'failed', 'timeout', 'cancelled'].includes(status)
      ) {
        updateData.endTime = updateData.endTime || new Date();
      }

      const execution = await this.executionModel.findOneAndUpdate(
        { executionId },
        updateData,
        { new: true },
      );

      if (!execution) {
        throw new NotFoundException(
          `Execution with ID ${executionId} not found`,
        );
      }

      return execution.toJSON();
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update execution status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Cancel a running or queued execution
   */
  async cancel(
    executionId: string,
  ): Promise<void> {
    try {
      const isObjectId = /^[a-f0-9]{24}$/.test(executionId);
      const execution = isObjectId
        ? await this.executionModel.findById(executionId)
        : await this.executionModel.findOne({ executionId });

      if (!execution) {
        throw new NotFoundException(
          `Execution with ID ${executionId} not found`,
        );
      }

      if (!['queued', 'running'].includes(execution.status)) {
        throw new BadRequestException(
          `Cannot cancel execution with status "${execution.status}"`,
        );
      }

      await this.executionModel.findOneAndUpdate(
        { executionId },
        {
          status: 'cancelled',
          endTime: new Date(),
          updatedAt: new Date(),
        },
      );

      this.logger.log(`Cancelled execution ${executionId}`);
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to cancel execution: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Retry a failed execution
   */
  async retry(
    executionId: string,
    retryDto: RetryExecutionDto,
  ): Promise<ScenarioExecution> {
    try {
      const isObjectId = /^[a-f0-9]{24}$/.test(executionId);
      const originalExecution = isObjectId
        ? await this.executionModel.findById(executionId)
        : await this.executionModel.findOne({ executionId });

      if (!originalExecution) {
        throw new NotFoundException(
          `Execution with ID ${executionId} not found`,
        );
      }

      if (
        !['failed', 'timeout', 'cancelled'].includes(
          originalExecution.status,
        )
      ) {
        throw new BadRequestException(
          `Cannot retry execution with status "${originalExecution.status}"`,
        );
      }

      // Create new execution based on original
      const newExecutionId = `exec_${randomUUID()}`;
      const retryCount =
        (originalExecution.retryInfo?.retryCount || 0) + 1;

      const newExecution = new this.executionModel({
        executionId: newExecutionId,
        scenarioId: originalExecution.scenarioId,
        agentId: originalExecution.agentId,
        personaId: originalExecution.personaId,
        scorecardId: originalExecution.scorecardId,
        triggerId: originalExecution.triggerId,
        status: 'queued',
        startTime: new Date(),
        triggeredBy: 'system',
        parameters: {
          ...originalExecution.parameters,
          ...retryDto.parameters,
        },
        environment: originalExecution.environment,
        retryInfo: {
          isRetry: true,
          retryCount,
          originalExecutionId: executionId,
          retryReason: retryDto.reason || 'Manual retry',
        },
        parentExecutionId: originalExecution._id,
      });

      const savedExecution = await newExecution.save();

      this.logger.log(
        `Created retry execution ${newExecutionId} for original ${executionId}`,
      );

      return savedExecution.toJSON();
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to retry execution: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Evaluate a completed execution against a scorecard.
   * Builds a transcript from stepResults and runs the EvaluationService.
   */
  async evaluate(
    executionId: string,
    dto: EvaluateExecutionDto,
  ): Promise<ScenarioExecution> {
    // 1. Load execution
    const isObjectId = /^[a-f0-9]{24}$/.test(executionId);
    const execution = isObjectId
      ? await this.executionModel.findById(executionId)
      : await this.executionModel.findOne({ executionId });

    if (!execution) {
      throw new NotFoundException(
        `Execution with ID ${executionId} not found`,
      );
    }

    if (execution.status !== 'completed') {
      throw new BadRequestException(
        `Cannot evaluate execution with status "${execution.status}". Execution must be completed.`,
      );
    }

    if (!execution.stepResults || execution.stepResults.length === 0) {
      throw new BadRequestException(
        'Execution has no step results to evaluate.',
      );
    }

    // 2. Build transcript from stepResults
    const conversationSteps = execution.stepResults.filter(
      (s) => s.role === 'persona' || s.role === 'agent',
    );

    if (conversationSteps.length === 0) {
      throw new BadRequestException(
        'Execution has no conversation steps (persona/agent) to evaluate.',
      );
    }

    const transcriptText = conversationSteps
      .map((s) =>
        s.role === 'agent'
          ? `Agent: ${s.actualResponse || ''}`
          : `Customer: ${s.actualResponse || ''}`,
      )
      .join('\n');

    const segments = conversationSteps.map((s) => ({
      speaker: s.role === 'agent' ? 'agent' : 'customer',
      text: s.actualResponse || '',
    }));

    // 3. Resolve an API key for the LLM judge via central resolver
    const judgeConfig = resolveLlmConfigSync(
      undefined,
      dto.apiKey ? { apiKey: dto.apiKey } : undefined,
    );
    const llmEvaluate = buildLlmJudge(judgeConfig || undefined);

    // 4. Calculate first-response latency metric
    const firstAgentStep = conversationSteps.find((s) => s.role === 'agent');
    const firstResponseLatency = firstAgentStep?.duration
      ? firstAgentStep.duration / 1000
      : 0;

    // 5. Run evaluation
    try {
      const evalResult = await this.evaluationService.evaluate(
        dto.scorecardId,
        {
          transcriptText,
          segments,
          metrics: { firstResponseLatency },
          llmEvaluate,
        },
        { scenarioExecutionId: execution.executionId },
      );

      // 6. Save results to execution via findOneAndUpdate
      const scorecardResults = {
        scorecardId: dto.scorecardId,
        resultId: evalResult.resultId,
        overallScore: evalResult.overallScore,
        passed: evalResult.passed,
        categoryScores: evalResult.categoryScores,
        criteriaResults: evalResult.criteriaResults.map((cr) => ({
          criteriaId: cr.criteriaId,
          criteriaKey: cr.criteriaKey,
          criteriaName: cr.criteriaName,
          categoryId: cr.categoryId,
          categoryName: cr.categoryName,
          passed: cr.passed,
          result: cr.result,
          reasoning: cr.reasoning,
          evidence: cr.evidence,
        })),
        evaluatedAt: new Date(),
      };

      const filter = isObjectId
        ? { _id: executionId }
        : { executionId };

      // Generate critical summary
      let scorecardSummary: string | undefined;
      try {
        const summaryConfig = resolveLlmConfigSync(undefined, dto.apiKey ? { apiKey: dto.apiKey } : undefined);
        if (summaryConfig) {
          scorecardSummary = await this.generateEvalSummary(evalResult, summaryConfig);
        }
      } catch {
        // Non-fatal — summary is optional
      }

      const updated = await this.executionModel.findOneAndUpdate(
        filter,
        { $set: { scorecardResults, ...(scorecardSummary ? { scorecardSummary } : {}) } },
        { new: true },
      );

      if (!updated) {
        throw new NotFoundException(
          `Execution with ID ${executionId} not found after evaluation`,
        );
      }

      this.logger.log(
        `Evaluated execution ${executionId} against scorecard ${dto.scorecardId} — score: ${evalResult.overallScore}, passed: ${evalResult.passed}`,
      );

      return updated.toJSON();
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to evaluate execution: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        `Evaluation failed: ${error.message}`,
      );
    }
  }

  private async generateEvalSummary(
    evalResult: { overallScore: number; passed: boolean; criteriaResults: Array<{ criteriaName?: string; categoryName?: string; passed: boolean; reasoning?: string }> },
    llmConfig: { kind: string; apiKey: string; model?: string },
  ): Promise<string | undefined> {
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
  }
}
