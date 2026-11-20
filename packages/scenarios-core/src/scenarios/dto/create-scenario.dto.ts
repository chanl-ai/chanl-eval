import {
  IsString,
  MaxLength,
  IsOptional,
  IsEnum,
  IsArray,
  IsObject,
  MinLength,
  ArrayMinSize,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';
import { DifficultyLevel } from '../schemas/scenario.schema';

export class CreateScenarioDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  context?: {
    situation?: string;
    objective?: string;
    background?: string;
    constraints?: string[];
  };

  @IsString()
  @MinLength(1)
  prompt!: string;

  @IsOptional()
  @IsEnum(['draft', 'active', 'paused', 'completed', 'archived'])
  status?: string;

  @IsOptional()
  @IsArray()
  promptVariables?: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'array';
    defaultValue: string;
    description?: string;
    required?: boolean;
  }>;

  /**
   * Free-form grouping label. Categories are domain-specific — an insurance workspace uses claims,
   * billing and retention; a SaaS one uses support and onboarding — so this is not a closed set.
   *
   * The storage layer has never constrained this field. A fixed allowlist here rejected values the
   * application itself writes, which made any scenario outside the list unsaveable: loading it and
   * pressing save with no edits failed validation.
   */
  @IsString()
  @MaxLength(64)
  category: string = 'support';

  @IsEnum(['easy', 'medium', 'hard'])
  difficulty: DifficultyLevel = 'medium';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  personaIds!: string[];

  @IsOptional()
  @IsString()
  scorecardId?: string;

  @ValidateIf((o) => o.simulationMode === 'phone')
  @IsNotEmpty({ message: 'phoneNumber is required when simulationMode is "phone"' })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsOptional()
  @IsEnum(['text', 'websocket', 'phone'])
  simulationMode?: 'text' | 'websocket' | 'phone';

  @IsOptional()
  @IsString()
  groundTruth?: string;

  @IsOptional()
  @IsString()
  personaStrategyType?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;
}
