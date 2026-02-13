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
import { PersonaService } from './persona.service';
import { CreatePersonaDto } from './dto/create-persona.dto';
import { UpdatePersonaDto } from './dto/update-persona.dto';

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

@Controller('personas')
export class PersonaController {
  private readonly logger = new Logger(PersonaController.name);

  constructor(private readonly personaService: PersonaService) {}

  @Post()
  async create(
    @Body() createPersonaDto: CreatePersonaDto,
    @Query('workspaceId') workspaceId?: string,
    @Query('userId') userId?: string,
  ) {
    try {
      const persona = await this.personaService.create(
        createPersonaDto,
        workspaceId,
        userId,
      );
      return {
        persona,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to create persona: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Persona creation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get()
  async findAll(
    @Query('workspaceId') workspaceId?: string,
    @Query('emotion') emotion?: string,
    @Query('language') language?: string,
    @Query('gender') gender?: string,
    @Query('accent') accent?: string,
    @Query('isActive') isActive?: string,
    @Query('isDefault') isDefault?: string,
    @Query('tags') tags?: string,
    @Query('createdBy') createdBy?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    try {
      const filters: any = {};
      if (emotion) filters.emotion = emotion;
      if (language) filters.language = language;
      if (gender) filters.gender = gender;
      if (accent) filters.accent = accent;
      if (isActive !== undefined) {
        filters.isActive = isActive === 'true';
      }
      if (isDefault !== undefined) {
        filters.isDefault = isDefault === 'true';
      }
      if (tags) {
        filters.tags = tags.split(',').map((tag) => tag.trim());
      }
      if (createdBy) filters.createdBy = createdBy;

      const page = pageStr ? parseInt(pageStr, 10) : 1;
      const limit = limitStr ? parseInt(limitStr, 10) : 10;
      const offset = (page - 1) * limit;

      const pagination: any = {
        page,
        limit,
        offset,
        sortBy,
        sortOrder,
      };

      const result = await this.personaService.findAll(
        workspaceId,
        filters,
        pagination,
      );

      return {
        personas: result.personas,
        total: result.total,
        pagination: buildPaginationResponse(result.total, page, limit),
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to retrieve personas: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to retrieve personas',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('defaults')
  async getDefaults(@Query('workspaceId') workspaceId?: string) {
    try {
      const personas =
        await this.personaService.getDefaultPersonas(workspaceId);

      return {
        personas,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to retrieve default personas: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to retrieve default personas',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('defaults')
  async createDefaults(
    @Query('workspaceId') workspaceId?: string,
    @Query('userId') userId?: string,
  ) {
    try {
      const personas = await this.personaService.createDefaultPersonas(
        workspaceId,
        userId,
      );

      return {
        personas,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to create default personas: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to create default personas',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('stats')
  async getStats(@Query('workspaceId') workspaceId?: string) {
    try {
      const stats = await this.personaService.getPersonaStats(workspaceId);

      return {
        stats,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to retrieve persona stats: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to retrieve persona statistics',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      const persona = await this.personaService.findOne(id);

      return {
        persona,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to retrieve persona: ${error.message}`,
        error.stack,
      );
      const status = error.message.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.INTERNAL_SERVER_ERROR;
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to retrieve persona',
        },
        status,
      );
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updatePersonaDto: UpdatePersonaDto,
    @Query('userId') userId?: string,
  ) {
    try {
      const persona = await this.personaService.update(
        id,
        updatePersonaDto,
        userId,
      );

      return {
        persona,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to update persona: ${error.message}`,
        error.stack,
      );
      const status = error.message.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to update persona',
        },
        status,
      );
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      await this.personaService.remove(id);

      return {
        deleted: true,
        message: 'Persona deleted successfully',
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to delete persona: ${error.message}`,
        error.stack,
      );
      const status = error.message.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.INTERNAL_SERVER_ERROR;
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to delete persona',
        },
        status,
      );
    }
  }
}
