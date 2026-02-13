import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class CreateScorecardCategoryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  weight?: number;

  @IsOptional()
  @IsNumber()
  order?: number;
}
