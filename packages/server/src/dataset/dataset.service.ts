import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  ScenarioExecution,
  ScenarioExecutionDocument,
  StepResult,
} from '@chanl/scenarios-core';
import { Scenario, ScenarioDocument } from '@chanl/scenarios-core';
import { Persona, PersonaDocument } from '@chanl/scenarios-core';
import { ExecutionService } from '@chanl/scenarios-core';
import {
  stepResultsToConversation,
  toOpenAIChatJsonl,
  toShareGPTJsonl,
  toDPOJsonl,
  type ConversationRecord,
  type ExportFormat,
} from '@chanl/scenarios-core';
import type { DatasetFiltersDto } from './dto';

@Injectable()
export class DatasetService {
  private readonly logger = new Logger(DatasetService.name);

  constructor(
    @InjectModel(ScenarioExecution.name)
    private executionModel: Model<ScenarioExecutionDocument>,
    @InjectModel(Scenario.name)
    private scenarioModel: Model<ScenarioDocument>,
    @InjectModel(Persona.name)
    private personaModel: Model<PersonaDocument>,
    private readonly executionService: ExecutionService,
  ) {}

  /**
   * Generate a batch of executions for dataset creation.
   * Creates one execution per persona (or up to `count` if no personas specified).
   */
  async generateBatch(opts: {
    scenarioId: string;
    promptId: string;
    personaIds?: string[];
    count?: number;
  }): Promise<{ batchId: string; executionIds: string[]; total: number }> {
    const batchId = `batch_${randomUUID()}`;

    const scenario = await this.scenarioModel.findById(opts.scenarioId);
    if (!scenario) {
      throw new NotFoundException(`Scenario ${opts.scenarioId} not found`);
    }

    // Determine which personas to use
    let personaIds: string[];
    if (opts.personaIds?.length) {
      personaIds = opts.personaIds;
    } else {
      // Use all personas linked to the scenario, or all active personas
      const personas = scenario.personaIds?.length
        ? scenario.personaIds.map((id) => id.toString())
        : (await this.personaModel.find({ isActive: true }).select('_id').limit(opts.count || 10)).map((p) => p._id.toString());
      personaIds = personas;
    }

    // If count is specified and less than personas, take a subset
    if (opts.count && opts.count < personaIds.length) {
      personaIds = personaIds.slice(0, opts.count);
    }

    // If count is specified and more than personas, repeat personas
    if (opts.count && opts.count > personaIds.length) {
      const original = [...personaIds];
      while (personaIds.length < opts.count) {
        personaIds.push(original[personaIds.length % original.length]);
      }
    }

    const executionIds: string[] = [];

    for (const personaId of personaIds) {
      try {
        const executionId = await this.executionService.execute(
          opts.scenarioId,
          {
            promptId: opts.promptId,
            personaId,
            triggeredBy: `dataset:${batchId}`,
          },
        );

        // Stamp batchId on the execution
        await this.executionModel.findOneAndUpdate(
          { executionId },
          { $set: { batchId } },
        );

        executionIds.push(executionId);
      } catch (err: any) {
        this.logger.warn(`Failed to create execution for persona ${personaId}: ${err.message}`);
      }
    }

    this.logger.log(`Created batch ${batchId} with ${executionIds.length} executions`);

    return { batchId, executionIds, total: executionIds.length };
  }

  /**
   * Get the status of a batch generation run.
   */
  async getBatchStatus(batchId: string): Promise<{
    batchId: string;
    total: number;
    completed: number;
    failed: number;
    running: number;
    queued: number;
    status: 'running' | 'completed' | 'partial' | 'failed';
  }> {
    const executions = await this.executionModel.find({ batchId }).select('status').lean();

    if (!executions.length) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    const counts = {
      total: executions.length,
      completed: executions.filter((e) => e.status === 'completed').length,
      failed: executions.filter((e) => e.status === 'failed').length,
      running: executions.filter((e) => e.status === 'running').length,
      queued: executions.filter((e) => e.status === 'queued').length,
    };

    let status: 'running' | 'completed' | 'partial' | 'failed';
    if (counts.running > 0 || counts.queued > 0) {
      status = 'running';
    } else if (counts.completed === counts.total) {
      status = 'completed';
    } else if (counts.failed === counts.total) {
      status = 'failed';
    } else {
      status = 'partial';
    }

    return { batchId, ...counts, status };
  }

  /**
   * Build a MongoDB query from dataset filters.
   */
  private buildQuery(filters?: DatasetFiltersDto): Record<string, any> {
    const query: any = { status: 'completed' }; // Only export completed executions

    if (filters?.scenarioIds?.length) {
      query.scenarioId = { $in: filters.scenarioIds.map((id) => new Types.ObjectId(id)) };
    }
    if (filters?.personaIds?.length) {
      query.personaId = { $in: filters.personaIds.map((id) => new Types.ObjectId(id)) };
    }
    if (filters?.minScore !== undefined) {
      query.overallScore = { $gte: filters.minScore };
    }
    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.batchId) {
      query.batchId = filters.batchId;
    }
    if (filters?.fromDate || filters?.toDate) {
      query.createdAt = {};
      if (filters?.fromDate) query.createdAt.$gte = new Date(filters.fromDate);
      if (filters?.toDate) query.createdAt.$lte = new Date(filters.toDate);
    }

    return query;
  }

  /**
   * Preview what an export would contain (count + sample).
   */
  async preview(
    format: ExportFormat,
    filters?: DatasetFiltersDto,
    systemPrompt?: string,
  ): Promise<{
    count: number;
    avgScore: number;
    sampleLine: string | null;
    format: string;
  }> {
    const query = this.buildQuery(filters);

    const [countResult, sampleExec] = await Promise.all([
      this.executionModel.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            avgScore: { $avg: '$overallScore' },
          },
        },
      ]),
      this.executionModel.findOne(query).sort({ createdAt: -1 }).lean(),
    ]);

    const count = countResult[0]?.count || 0;
    const avgScore = Math.round((countResult[0]?.avgScore || 0) * 10) / 10;

    let sampleLine: string | null = null;
    if (sampleExec?.stepResults?.length) {
      const record = this.executionToConversation(sampleExec, systemPrompt);
      sampleLine = this.formatLine(record, format);
    }

    return { count, avgScore, sampleLine, format };
  }

  /**
   * Export executions as training data lines.
   * Returns an async generator that yields one JSONL line at a time.
   */
  async *exportLines(
    format: ExportFormat,
    filters?: DatasetFiltersDto,
    options?: { systemPrompt?: string; includeMetadata?: boolean },
  ): AsyncGenerator<{ line: string; metadata?: string }> {
    const query = this.buildQuery(filters);
    const cursor = this.executionModel.find(query).sort({ createdAt: 1 }).cursor();

    if (format === 'dpo') {
      // DPO requires pairs — collect by scenario+persona, pair by score
      yield* this.exportDPOLines(query, options);
      return;
    }

    for await (const doc of cursor) {
      if (!doc.stepResults?.length) continue;

      const record = this.executionToConversation(doc.toJSON(), options?.systemPrompt);
      const line = this.formatLine(record, format);
      if (!line) continue;

      const result: { line: string; metadata?: string } = { line };
      if (options?.includeMetadata) {
        result.metadata = JSON.stringify(record.metadata);
      }

      yield result;
    }
  }

  /**
   * DPO export: group executions by scenario, pair by score within each group.
   */
  private async *exportDPOLines(
    query: Record<string, any>,
    options?: { systemPrompt?: string; includeMetadata?: boolean },
  ): AsyncGenerator<{ line: string; metadata?: string }> {
    // Group completed executions by scenarioId
    const executions = await this.executionModel.find(query).sort({ overallScore: -1 }).lean();

    const byScenario = new Map<string, any[]>();
    for (const exec of executions) {
      const key = exec.scenarioId?.toString() || 'unknown';
      if (!byScenario.has(key)) byScenario.set(key, []);
      byScenario.get(key)!.push(exec);
    }

    for (const [, group] of byScenario) {
      if (group.length < 2) continue;

      // Sort by score desc, pair best with worst
      group.sort((a: any, b: any) => (b.overallScore || 0) - (a.overallScore || 0));

      const half = Math.floor(group.length / 2);
      for (let i = 0; i < half; i++) {
        const preferred = group[i];
        const nonPreferred = group[group.length - 1 - i];
        if (!preferred.stepResults?.length || !nonPreferred.stepResults?.length) continue;

        const prefRecord = this.executionToConversation(preferred, options?.systemPrompt);
        const nonPrefRecord = this.executionToConversation(nonPreferred, options?.systemPrompt);

        const line = toDPOJsonl(prefRecord, nonPrefRecord);
        if (!line) continue;

        const result: { line: string; metadata?: string } = { line };
        if (options?.includeMetadata) {
          result.metadata = JSON.stringify({
            preferred: prefRecord.metadata,
            nonPreferred: nonPrefRecord.metadata,
          });
        }

        yield result;
      }
    }
  }

  /**
   * Convert a raw execution document into a ConversationRecord.
   */
  private executionToConversation(
    exec: any,
    systemPromptOverride?: string,
  ): ConversationRecord {
    return stepResultsToConversation(exec.stepResults as StepResult[], {
      systemPrompt: systemPromptOverride,
      metadata: {
        executionId: exec.executionId || exec.id || exec._id?.toString(),
        scenarioId: exec.scenarioId?.toString() || '',
        personaId: exec.personaId?.toString(),
        score: exec.overallScore,
        turnCount: Math.ceil((exec.stepResults?.length || 0) / 2),
        duration: exec.duration,
      },
    });
  }

  /**
   * Format a ConversationRecord into a single JSONL line.
   */
  private formatLine(record: ConversationRecord, format: ExportFormat): string | null {
    switch (format) {
      case 'openai':
        return toOpenAIChatJsonl(record, { includeTools: false });
      case 'openai-tools':
        return toOpenAIChatJsonl(record, { includeTools: true });
      case 'sharegpt':
        return toShareGPTJsonl(record);
      default:
        return null;
    }
  }
}
