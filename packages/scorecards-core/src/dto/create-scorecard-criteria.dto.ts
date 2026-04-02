import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsBoolean,
} from 'class-validator';

export class CreateScorecardCriteriaDto {
  @IsString()
  categoryId!: string;

  @IsOptional()
  @IsString()
  key?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum([
    'prompt',
    'keyword',
    'response_time',
    'tool_call',
    'hallucination',
    'knowledge_retention',
    'conversation_completeness',
    'role_adherence',
    'rag_faithfulness',
  ])
  type!: string;

  @IsObject()
  settings!: any;

  @IsOptional()
  @IsObject()
  threshold?: any;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
