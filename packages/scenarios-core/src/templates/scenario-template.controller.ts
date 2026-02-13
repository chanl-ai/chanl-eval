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
} from '@nestjs/common';
import { ScenarioTemplateService } from './scenario-template.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { InstantiateTemplateDto } from './dto/instantiate-template.dto';

@Controller('templates')
export class ScenarioTemplateController {
  constructor(
    private readonly templateService: ScenarioTemplateService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateTemplateDto) {
    const template = await this.templateService.create(dto);
    return { template };
  }

  @Get()
  async findAll(
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.templateService.findAll(
      { category, status, search },
      {
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
    );
    return {
      templates: result.templates,
      total: result.total,
    };
  }

  @Post('seed')
  @HttpCode(HttpStatus.CREATED)
  async seed() {
    const created = await this.templateService.seedBuiltInTemplates();
    return {
      message: `Seeded ${created.length} templates`,
      templates: created,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const template = await this.templateService.findOne(id);
    return { template };
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    const template = await this.templateService.update(id, dto);
    return { template };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.templateService.remove(id);
    return { deleted: true };
  }

  @Post(':id/instantiate')
  async instantiate(
    @Param('id') id: string,
    @Body() dto: InstantiateTemplateDto,
  ) {
    const scenarioData = await this.templateService.instantiate(id, dto);
    return { scenario: scenarioData };
  }

  @Post(':id/validate')
  async validate(@Param('id') id: string) {
    const template = await this.templateService.findOne(id);
    const result = this.templateService.validate(template);
    return result;
  }

  @Post(':id/clone')
  async clone(
    @Param('id') id: string,
    @Body() body: { name?: string },
  ) {
    const template = await this.templateService.clone(id, body.name);
    return { template };
  }
}
