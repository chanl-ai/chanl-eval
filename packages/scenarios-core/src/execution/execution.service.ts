import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  ScenarioExecution,
  ScenarioExecutionDocument,
} from '../scenarios/schemas/scenario-execution.schema';
import { Scenario, ScenarioDocument } from '../scenarios/schemas/scenario.schema';
import { QueueProducerService } from './queue-producer.service';

export interface ExecuteOptions {
  promptId: string;
  personaId?: string;
  maxTurns?: number;
  parameters?: Record<string, any>;
  environment?: string;
  triggeredBy?: string;
}

export interface ListExecutionsFilters {
  status?: string;
  scenarioId?: string;
  agentId?: string;
  personaId?: string;
}

export interface ListExecutionsPagination {
  limit?: number;
  offset?: number;
}

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    @InjectModel(ScenarioExecution.name)
    private executionModel: Model<ScenarioExecutionDocument>,
    @InjectModel(Scenario.name)
    private scenarioModel: Model<ScenarioDocument>,
    private readonly queueProducer: QueueProducerService,
  ) {}

  /**
   * Create an execution document (status: queued) and enqueue a BullMQ job.
   *
   * @returns The executionId string
   */
  async execute(
    scenarioId: string,
    options: ExecuteOptions,
  ): Promise<string> {
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
        promptId: options?.promptId
          ? new Types.ObjectId(options.promptId)
          : undefined,
        personaId: options?.personaId
          ? new Types.ObjectId(options.personaId)
          : scenario.personaIds?.[0],
        status: 'queued',
        startTime: new Date(),
        triggeredBy: options?.triggeredBy || 'system',
        parameters: options?.parameters || {},
        environment: {
          version: '1.0.0',
          environment: options?.environment || 'development',
        },
      };

      const execution = new this.executionModel(executionData);
      await execution.save();

      // Enqueue the BullMQ job
      await this.queueProducer.enqueueExecution(executionId, scenarioId, {
        promptId: options.promptId,
        personaId:
          options?.personaId || scenario.personaIds?.[0]?.toString(),
        maxTurns: options?.maxTurns,
        parameters: options?.parameters,
      });

      this.logger.log(
        `Created and enqueued execution ${executionId} for scenario ${scenarioId}`,
      );

      return executionId;
    } catch (error: any) {
      this.logger.error(
        `Failed to execute scenario: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get a single execution by executionId.
   */
  async getExecution(
    executionId: string,
  ): Promise<ScenarioExecution> {
    try {
      const execution = await this.executionModel.findOne({ executionId });

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
        `Failed to get execution: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * List executions with filters and pagination.
   */
  async listExecutions(
    filters?: ListExecutionsFilters,
    pagination?: ListExecutionsPagination,
  ): Promise<{ executions: ScenarioExecution[]; total: number }> {
    try {
      const query: any = {};

      if (filters) {
        if (filters.status) {
          query.status = filters.status;
        }
        if (filters.scenarioId) {
          query.scenarioId = new Types.ObjectId(filters.scenarioId);
        }
        if (filters.agentId) {
          query.agentId = new Types.ObjectId(filters.agentId);
        }
        if (filters.personaId) {
          query.personaId = new Types.ObjectId(filters.personaId);
        }
      }

      let queryBuilder = this.executionModel
        .find(query)
        .sort({ startTime: -1 });

      if (pagination?.offset) {
        queryBuilder = queryBuilder.skip(pagination.offset);
      }
      if (pagination?.limit) {
        queryBuilder = queryBuilder.limit(pagination.limit);
      }

      const executions = await queryBuilder.exec();
      const total = await this.executionModel.countDocuments(query);

      return {
        executions: executions.map((e) => e.toJSON()),
        total,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to list executions: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Cancel a running or queued execution.
   * Transitions status from running/queued to cancelled.
   */
  async cancelExecution(
    executionId: string,
  ): Promise<void> {
    try {
      const execution = await this.executionModel.findOne({ executionId });

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
}
