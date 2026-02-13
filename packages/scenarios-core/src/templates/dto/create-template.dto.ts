import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsObject,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TemplateVariable, TemplateStep } from '../schemas/scenario-template.schema';

export class CreateTemplateDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(['support', 'sales', 'onboarding', 'survey', 'healthcare', 'technical', 'custom'])
  category!: string;

  @IsOptional()
  @IsEnum(['public', 'workspace', 'private'])
  visibility?: string;

  @IsString()
  prompt!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(['easy', 'medium', 'hard'])
  difficulty?: string;

  @IsOptional()
  @IsArray()
  variables?: TemplateVariable[];

  @IsOptional()
  @IsArray()
  steps?: TemplateStep[];

  @IsOptional()
  @IsObject()
  defaultPersonaConfig?: Record<string, any>;

  @IsOptional()
  @IsObject()
  defaultScoringConfig?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}
