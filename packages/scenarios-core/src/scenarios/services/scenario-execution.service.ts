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
} from '../schemas/scenario-execution.schema';
import { Scenario, ScenarioDocument } from '../schemas/scenario.schema';
import {
  ExecuteScenarioDto,
  RetryExecutionDto,
} from '../dto/execute-scenario.dto';

@Injectable()
export class ScenarioExecutionService {
  private readonly logger = new Logger(ScenarioExecutionService.name);

  constructor(
    @InjectModel(ScenarioExecution.name)
    private executionModel: Model<ScenarioExecutionDocument>,
    @InjectModel(Scenario.name)
    private scenarioModel: Model<ScenarioDocument>,
  ) {}

  /**
   * Create and queue a scenario execution.
   * Note: actual queue processing will be wired up by the execution engine (Task 4).
   */
  async execute(
    scenarioId: string,
    executeDto: ExecuteScenarioDto,
    workspaceId?: string,
    userId?: string,
  ): Promise<ScenarioExecution> {
    try {
      // Verify scenario exists and is active
      const scenario = await this.scenarioModel.findById(scenarioId);
      if (!scenario) {
        throw new NotFoundException(
          `Scenario with ID ${scenarioId} not found`,
        );
      }

      if (
        workspaceId &&
        scenario.workspaceId?.toString() !== workspaceId
      ) {
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
        agentId: executeDto.agentId
          ? new Types.ObjectId(executeDto.agentId)
          : scenario.agentIds?.[0],
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
        triggeredBy: userId || 'system',
        queuedBy: userId,
        parameters: executeDto.parameters || {},
        environment: {
          version: '1.0.0',
          environment: executeDto.environment || 'development',
        },
      };

      if (workspaceId) {
        executionData.workspaceId = new Types.ObjectId(workspaceId);
      }

      const execution = new this.executionModel(executionData);
      const savedExecution = await execution.save();

      // Note: Queue processing will be handled by execution engine (Task 4)
      this.logger.log(
        `Created execution ${executionId} for scenario ${scenarioId}`,
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
    workspaceId?: string,
  ): Promise<ScenarioExecution> {
    try {
      const execution = await this.executionModel.findOne({ executionId });

      if (!execution) {
        throw new NotFoundException(
          `Execution with ID ${executionId} not found`,
        );
      }

      if (
        workspaceId &&
        execution.workspaceId?.toString() !== workspaceId
      ) {
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
    workspaceId?: string,
    pagination?: { limit?: number; offset?: number },
  ): Promise<{ executions: ScenarioExecution[]; total: number }> {
    try {
      const query: any = {
        scenarioId: new Types.ObjectId(scenarioId),
      };

      if (workspaceId) {
        query.workspaceId = new Types.ObjectId(workspaceId);
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
    workspaceId?: string,
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

      if (workspaceId) {
        query.workspaceId = new Types.ObjectId(workspaceId);
      }

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
    workspaceId?: string,
  ): Promise<void> {
    try {
      const execution = await this.executionModel.findOne({ executionId });

      if (!execution) {
        throw new NotFoundException(
          `Execution with ID ${executionId} not found`,
        );
      }

      if (
        workspaceId &&
        execution.workspaceId?.toString() !== workspaceId
      ) {
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
    workspaceId?: string,
    userId?: string,
  ): Promise<ScenarioExecution> {
    try {
      const originalExecution = await this.executionModel.findOne({
        executionId,
      });

      if (!originalExecution) {
        throw new NotFoundException(
          `Execution with ID ${executionId} not found`,
        );
      }

      if (
        workspaceId &&
        originalExecution.workspaceId?.toString() !== workspaceId
      ) {
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
        workspaceId: originalExecution.workspaceId,
        agentId: originalExecution.agentId,
        personaId: originalExecution.personaId,
        scorecardId: originalExecution.scorecardId,
        triggerId: originalExecution.triggerId,
        status: 'queued',
        startTime: new Date(),
        triggeredBy: userId || 'system',
        queuedBy: userId,
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
}
