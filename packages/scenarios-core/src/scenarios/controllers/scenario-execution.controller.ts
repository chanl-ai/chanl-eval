import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Logger,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ScenarioExecutionService } from '../services/scenario-execution.service';
import {
  ExecuteScenarioDto,
  RetryExecutionDto,
} from '../dto/execute-scenario.dto';

/**
 * Simple pagination response builder.
 * Replaces the @chanl-ai/nestjs-common buildPaginationResponse for OSS usage.
 */
function buildPaginationResponse(total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

@Controller('scenarios')
export class ScenarioExecutionController {
  private readonly logger = new Logger(ScenarioExecutionController.name);

  constructor(
    private readonly executionService: ScenarioExecutionService,
  ) {}

  @Post(':id/execute')
  async execute(
    @Param('id') scenarioId: string,
    @Body() executeDto: ExecuteScenarioDto,
  ) {
    try {
      const execution = await this.executionService.execute(
        scenarioId,
        executeDto,
      );
      return { execution };
    } catch (error: any) {
      this.logger.error(
        `Failed to execute scenario: ${error.message}`,
        error.stack,
      );
      const status = error.message.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Execution failed',
        },
        status,
      );
    }
  }

  @Get(':id/executions')
  async getScenarioExecutions(
    @Param('id') scenarioId: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    try {
      const page = pageStr ? parseInt(pageStr, 10) : 1;
      const limit = limitStr ? parseInt(limitStr, 10) : 10;
      const offset = (page - 1) * limit;

      const result = await this.executionService.findByScenario(
        scenarioId,
        { limit, offset },
      );

      return {
        executions: result.executions,
        total: result.total,
        pagination: buildPaginationResponse(result.total, page, limit),
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to retrieve executions: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to retrieve executions',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('executions')
  async getAllExecutions(
    @Query('scenarioId') scenarioId?: string,
    @Query('agentId') agentId?: string,
    @Query('personaId') personaId?: string,
    @Query('status') status?: string,
    @Query('triggerId') triggerId?: string,
    @Query('triggeredBy') triggeredBy?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    try {
      const filters: any = {};
      if (scenarioId) filters.scenarioId = scenarioId;
      if (agentId) filters.agentId = agentId;
      if (personaId) filters.personaId = personaId;
      if (status) filters.status = status;
      if (triggerId) filters.triggerId = triggerId;
      if (triggeredBy) filters.triggeredBy = triggeredBy;
      if (fromDate) filters.fromDate = fromDate;
      if (toDate) filters.toDate = toDate;

      const page = pageStr ? parseInt(pageStr, 10) : 1;
      const limit = limitStr ? parseInt(limitStr, 10) : 10;
      const offset = (page - 1) * limit;

      const result = await this.executionService.findAll(
        filters,
        { limit, offset },
      );

      return {
        executions: result.executions,
        total: result.total,
        pagination: buildPaginationResponse(result.total, page, limit),
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to retrieve executions: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to retrieve executions',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('executions/:executionId')
  async getExecution(
    @Param('executionId') executionId: string,
  ) {
    try {
      const execution = await this.executionService.findOne(
        executionId,
      );
      return { execution };
    } catch (error: any) {
      this.logger.error(
        `Failed to retrieve execution: ${error.message}`,
        error.stack,
      );
      const status = error.message.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.INTERNAL_SERVER_ERROR;
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to retrieve execution',
        },
        status,
      );
    }
  }

  @Delete('executions/:executionId')
  async cancelExecution(
    @Param('executionId') executionId: string,
  ) {
    try {
      await this.executionService.cancel(executionId);
      return {
        deleted: true,
        message: 'Execution cancelled successfully',
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to cancel execution: ${error.message}`,
        error.stack,
      );
      const status = error.message.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to cancel execution',
        },
        status,
      );
    }
  }

  @Post('executions/:executionId/retry')
  async retryExecution(
    @Param('executionId') executionId: string,
    @Body() retryDto: RetryExecutionDto,
  ) {
    try {
      const execution = await this.executionService.retry(
        executionId,
        retryDto,
      );
      return { execution };
    } catch (error: any) {
      this.logger.error(
        `Failed to retry execution: ${error.message}`,
        error.stack,
      );
      const status = error.message.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to retry execution',
        },
        status,
      );
    }
  }
}
