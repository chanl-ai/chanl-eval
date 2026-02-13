import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class CreateScorecardDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['active', 'inactive', 'draft'])
  status?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  passingThreshold?: number;

  @IsOptional()
  @IsEnum([
    'weighted_average',
    'simple_average',
    'minimum_all',
    'pass_fail',
  ])
  scoringAlgorithm?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
