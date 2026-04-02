import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { ExportFormat } from '@chanl/scenarios-core';
import { DatasetService } from './dataset.service';

/** Minimal writable response interface (avoids @types/express dependency) */
interface StreamResponse {
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean;
  end(): void;
}
import {
  GenerateDatasetDto,
  ExportDatasetDto,
  ExportPreviewQueryDto,
} from './dto';

@ApiTags('Datasets')
@Controller('datasets')
export class DatasetController {
  constructor(private readonly datasetService: DatasetService) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a batch of conversations for dataset creation' })
  @ApiResponse({ status: 201, description: 'Batch created' })
  async generate(@Body(new ValidationPipe({ transform: true })) dto: GenerateDatasetDto) {
    return this.datasetService.generateBatch({
      scenarioId: dto.scenarioId,
      promptId: dto.promptId,
      personaIds: dto.personaIds,
      count: dto.count,
    });
  }

  @Get('generate/:batchId/status')
  @ApiOperation({ summary: 'Get batch generation status' })
  @ApiResponse({ status: 200, description: 'Batch status' })
  async getBatchStatus(@Param('batchId') batchId: string) {
    return this.datasetService.getBatchStatus(batchId);
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export executions as training data (streams JSONL/JSON download)' })
  @ApiResponse({ status: 200, description: 'Training data file' })
  async exportDataset(
    @Body(new ValidationPipe({ transform: true })) dto: ExportDatasetDto,
    @Res() res: StreamResponse,
  ) {
    const format = dto.format;
    const ext = format === 'sharegpt' ? 'json' : 'jsonl';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `dataset-${format}-${timestamp}.${ext}`;

    res.setHeader('Content-Type', ext === 'json' ? 'application/json' : 'application/x-ndjson');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    let lineCount = 0;

    if (format === 'sharegpt') {
      res.write('[\n');
    }

    for await (const { line } of this.datasetService.exportLines(
      format,
      dto.filters,
      dto.options,
    )) {
      if (format === 'sharegpt') {
        if (lineCount > 0) res.write(',\n');
        res.write(line);
      } else {
        res.write(line + '\n');
      }

      lineCount++;
    }

    if (format === 'sharegpt') {
      res.write('\n]');
    }

    res.end();
  }

  @Get('export/preview')
  @ApiOperation({ summary: 'Preview what an export would contain' })
  @ApiResponse({ status: 200, description: 'Export preview with count, avg score, and sample line' })
  async preview(@Query(new ValidationPipe({ transform: true })) query: ExportPreviewQueryDto) {
    const format = (query.format || 'openai') as ExportFormat;
    const filters = {
      scenarioIds: query.scenarioIds?.split(',').filter(Boolean),
      personaIds: query.personaIds?.split(',').filter(Boolean),
      minScore: query.minScore,
      status: query.status,
      batchId: query.batchId,
    };

    return this.datasetService.preview(format, filters);
  }
}
