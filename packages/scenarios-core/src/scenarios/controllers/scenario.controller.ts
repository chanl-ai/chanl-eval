import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Logger,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ScenarioService } from '../services/scenario.service';
import { CreateScenarioDto } from '../dto/create-scenario.dto';
import { UpdateScenarioDto } from '../dto/update-scenario.dto';

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
export class ScenarioController {
  private readonly logger = new Logger(ScenarioController.name);

  constructor(private readonly scenarioService: ScenarioService) {}

  @Post()
  async create(
    @Body() createScenarioDto: CreateScenarioDto,
    @Query('workspaceId') workspaceId?: string,
    @Query('userId') userId?: string,
  ) {
    try {
      const scenario = await this.scenarioService.create(
        createScenarioDto,
        workspaceId,
        userId,
      );
      return { scenario };
    } catch (error: any) {
      this.logger.error(
        `Failed to create scenario: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Scenario creation failed',
        },
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get()
  async findAll(
    @Query('workspaceId') workspaceId?: string,
    @Query('agentId') agentId?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('difficulty') difficulty?: string,
    @Query('tags') tags?: string,
    @Query('createdBy') createdBy?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    try {
      const filters: any = {};
      if (agentId) filters.agentId = agentId;
      if (status) filters.status = status;
      if (category) filters.category = category;
      if (difficulty) filters.difficulty = difficulty;
      if (tags) filters.tags = tags.split(',').map((t) => t.trim());
      if (createdBy) filters.createdBy = createdBy;

      const page = pageStr ? parseInt(pageStr, 10) : 1;
      const limit = limitStr ? parseInt(limitStr, 10) : 10;
      const offset = (page - 1) * limit;

      const pagination = {
        limit,
        offset,
        sortBy,
        sortOrder,
      };

      const result = await this.scenarioService.findAll(
        workspaceId,
        filters,
        pagination,
      );

      return {
        scenarios: result.scenarios,
        total: result.total,
        pagination: buildPaginationResponse(result.total, page, limit),
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to retrieve scenarios: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to retrieve scenarios',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('stats')
  async getStats(@Query('workspaceId') workspaceId?: string) {
    try {
      const stats =
        await this.scenarioService.getScenarioStats(workspaceId);
      return { stats };
    } catch (error: any) {
      this.logger.error(
        `Failed to retrieve scenario stats: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to retrieve scenario statistics',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    try {
      const scenario = await this.scenarioService.findOne(id, workspaceId);
      return { scenario };
    } catch (error: any) {
      this.logger.error(
        `Failed to retrieve scenario: ${error.message}`,
        error.stack,
      );
      const httpStatus = error.message.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.INTERNAL_SERVER_ERROR;
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to retrieve scenario',
        },
        httpStatus,
      );
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateScenarioDto: UpdateScenarioDto,
    @Query('workspaceId') workspaceId?: string,
    @Query('userId') userId?: string,
  ) {
    try {
      const scenario = await this.scenarioService.update(
        id,
        updateScenarioDto,
        workspaceId,
        userId,
      );
      return { scenario };
    } catch (error: any) {
      this.logger.error(
        `Failed to update scenario: ${error.message}`,
        error.stack,
      );
      const httpStatus = error.message.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to update scenario',
        },
        httpStatus,
      );
    }
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    try {
      await this.scenarioService.remove(id, workspaceId);
      return { deleted: true, message: 'Scenario archived successfully' };
    } catch (error: any) {
      this.logger.error(
        `Failed to delete scenario: ${error.message}`,
        error.stack,
      );
      const httpStatus = error.message.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.INTERNAL_SERVER_ERROR;
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to delete scenario',
        },
        httpStatus,
      );
    }
  }

  @Post(':id/clone')
  async clone(
    @Param('id') id: string,
    @Body() body: { name?: string },
    @Query('workspaceId') workspaceId?: string,
    @Query('userId') userId?: string,
  ) {
    try {
      const scenario = await this.scenarioService.clone(
        id,
        userId,
        body.name,
        workspaceId,
      );
      return { scenario };
    } catch (error: any) {
      this.logger.error(
        `Failed to clone scenario: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to clone scenario',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':id/validate')
  async validate(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    try {
      const result = await this.scenarioService.validate(id, workspaceId);
      return result;
    } catch (error: any) {
      this.logger.error(
        `Failed to validate scenario: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to validate scenario',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':id/publish')
  async publish(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId?: string,
    @Query('userId') userId?: string,
  ) {
    try {
      const result = await this.scenarioService.publish(
        id,
        workspaceId,
        userId,
      );
      return result;
    } catch (error: any) {
      this.logger.error(
        `Failed to publish scenario: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to publish scenario',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':id/unpublish')
  async unpublish(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId?: string,
    @Query('userId') userId?: string,
  ) {
    try {
      const result = await this.scenarioService.unpublish(
        id,
        workspaceId,
        userId,
      );
      return result;
    } catch (error: any) {
      this.logger.error(
        `Failed to unpublish scenario: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to unpublish scenario',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('import/yaml')
  async importYaml(
    @Body() body: { yaml: string },
    @Query('workspaceId') workspaceId?: string,
    @Query('userId') userId?: string,
  ) {
    try {
      const scenario = await this.scenarioService.fromYaml(
        body.yaml,
        workspaceId,
        userId,
      );
      return { scenario };
    } catch (error: any) {
      this.logger.error(
        `Failed to import scenario from YAML: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to import scenario from YAML',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':id/export/yaml')
  async exportYaml(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    try {
      const scenario = await this.scenarioService.findOne(id, workspaceId);
      const yamlString = this.scenarioService.toYaml(scenario);
      return { yaml: yamlString };
    } catch (error: any) {
      this.logger.error(
        `Failed to export scenario to YAML: ${error.message}`,
        error.stack,
      );
      const httpStatus = error.message.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.INTERNAL_SERVER_ERROR;
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to export scenario to YAML',
        },
        httpStatus,
      );
    }
  }
}
