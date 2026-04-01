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
import { ToolFixtureService } from './tool-fixture.service';
import { CreateToolFixtureDto } from './dto/create-tool-fixture.dto';
import { UpdateToolFixtureDto } from './dto/update-tool-fixture.dto';

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

@Controller('tool-fixtures')
export class ToolFixtureController {
  private readonly logger = new Logger(ToolFixtureController.name);

  constructor(private readonly toolFixtureService: ToolFixtureService) {}

  @Post()
  async create(
    @Body() createDto: CreateToolFixtureDto,
  ) {
    try {
      const toolFixture = await this.toolFixtureService.create(createDto);
      return {
        toolFixture,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to create tool fixture: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Tool fixture creation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get()
  async findAll(
    @Query('isActive') isActive?: string,
    @Query('tags') tags?: string,
    @Query('search') search?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    try {
      const filters: any = {};
      if (isActive !== undefined) {
        filters.isActive = isActive === 'true';
      }
      if (tags) {
        filters.tags = tags.split(',').map((tag) => tag.trim());
      }
      if (search) {
        filters.search = search;
      }

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

      const result = await this.toolFixtureService.findAll(
        filters,
        pagination,
      );

      return {
        toolFixtures: result.toolFixtures,
        total: result.total,
        pagination: buildPaginationResponse(result.total, page, limit),
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to retrieve tool fixtures: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to retrieve tool fixtures',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('stats')
  async getStats() {
    try {
      const stats = await this.toolFixtureService.getStats();

      return {
        stats,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to retrieve tool fixture stats: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to retrieve tool fixture statistics',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      const toolFixture = await this.toolFixtureService.findOne(id);

      return {
        toolFixture,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to retrieve tool fixture: ${error.message}`,
        error.stack,
      );
      const status = error.message.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.INTERNAL_SERVER_ERROR;
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to retrieve tool fixture',
        },
        status,
      );
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateToolFixtureDto,
  ) {
    try {
      const toolFixture = await this.toolFixtureService.update(id, updateDto);

      return {
        toolFixture,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to update tool fixture: ${error.message}`,
        error.stack,
      );
      const status = error.message.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_REQUEST;
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to update tool fixture',
        },
        status,
      );
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      await this.toolFixtureService.remove(id);

      return {
        deleted: true,
        message: 'Tool fixture deleted successfully',
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to delete tool fixture: ${error.message}`,
        error.stack,
      );
      const status = error.message.includes('not found')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.INTERNAL_SERVER_ERROR;
      throw new HttpException(
        {
          success: false,
          message: error.message,
          error: 'Failed to delete tool fixture',
        },
        status,
      );
    }
  }
}
