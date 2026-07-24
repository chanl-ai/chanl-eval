import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsBoolean,
} from 'class-validator';
import { CriteriaType } from '../schemas/scorecard-criteria.schema';

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

  // Derived from CriteriaType so a new handler type can never be registered in the engine but
  // rejected at the API — the hand-maintained copy of this list had already drifted.
  @IsEnum(CriteriaType)
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
