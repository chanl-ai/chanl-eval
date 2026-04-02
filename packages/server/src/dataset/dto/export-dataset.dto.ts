import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum, IsArray, IsDateString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class DatasetFiltersDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scenarioIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  personaIds?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  minScore?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  batchId?: string;
}

export class ExportOptionsDto {
  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsBoolean()
  includeMetadata?: boolean;
}

export class ExportDatasetDto {
  @IsEnum(['openai', 'openai-tools', 'sharegpt', 'dpo'])
  format!: 'openai' | 'openai-tools' | 'sharegpt' | 'dpo';

  @IsOptional()
  @Type(() => DatasetFiltersDto)
  filters?: DatasetFiltersDto;

  @IsOptional()
  @Type(() => ExportOptionsDto)
  options?: ExportOptionsDto;
}

export class ExportPreviewQueryDto {
  @IsOptional()
  @IsString()
  format?: string;

  @IsOptional()
  @IsString()
  scenarioIds?: string; // comma-separated

  @IsOptional()
  @IsString()
  personaIds?: string; // comma-separated

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  minScore?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  batchId?: string;
}
