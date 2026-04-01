import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { PromptsService } from './prompts.service';

@Controller('prompts')
export class PromptsController {
  constructor(private readonly promptsService: PromptsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body()
    dto: {
      name: string;
      description?: string;
      content: string;
      status?: string;
      tags?: string[];
    },
  ) {
    const prompt = await this.promptsService.create(dto);
    return { prompt };
  }

  @Get()
  async findAll(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.promptsService.findAll({
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { prompts: result.prompts, total: result.total };
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const prompt = await this.promptsService.findById(id);
    return { prompt };
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body()
    dto: {
      name?: string;
      description?: string;
      content?: string;
      status?: string;
      tags?: string[];
    },
  ) {
    const prompt = await this.promptsService.update(id, dto);
    return { prompt };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.promptsService.remove(id);
    return { deleted: true };
  }
}
