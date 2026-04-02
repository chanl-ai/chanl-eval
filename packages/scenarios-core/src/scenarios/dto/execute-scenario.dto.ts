import {
  IsOptional,
  IsString,
  IsObject,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsArray,
} from 'class-validator';

export class ExecuteScenarioDto {
  @IsString()
  promptId!: string;

  @IsOptional()
  @IsEnum(['text', 'phone'])
  mode?: 'text' | 'phone';

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  personaId?: string;

  @IsOptional()
  @IsString()
  scorecardId?: string;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, any>;

  @IsOptional()
  @IsString()
  triggerId?: string;

  @IsOptional()
  @IsString()
  environment?: string;

  @IsOptional()
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  toolFixtureIds?: string[];
}

export class RetryExecutionDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, any>;
}

export class ExecutionFiltersDto {
  @IsOptional()
  @IsString()
  scenarioId?: string;

  @IsOptional()
  @IsString()
  promptId?: string;

  @IsOptional()
  @IsString()
  personaId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  triggerId?: string;

  @IsOptional()
  @IsString()
  triggeredBy?: string;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  @IsOptional()
  @IsNumber()
  minScore?: number;

  @IsOptional()
  @IsNumber()
  maxScore?: number;
}

export class EvaluateExecutionDto {
  @IsString()
  scorecardId!: string;

  @IsOptional()
  @IsString()
  apiKey?: string;
}
