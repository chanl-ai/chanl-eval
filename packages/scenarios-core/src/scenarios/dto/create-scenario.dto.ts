import {
  IsString,
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

  @IsEnum(['support', 'sales', 'booking', 'technical', 'onboarding', 'feedback'])
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

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  agentIds!: string[];

  @IsOptional()
  @IsString()
  scorecardId?: string;

  @IsOptional()
  @IsObject()
  agentOverrides?: Record<
    string,
    {
      promptOverride?: string;
      promptVariables?: Record<string, string>;
      temperature?: number;
      maxTokens?: number;
      tools?: string[];
      voice?: {
        voiceId?: string;
        speed?: number;
        stability?: number;
      };
    }
  >;

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
  createdBy?: string;
}
