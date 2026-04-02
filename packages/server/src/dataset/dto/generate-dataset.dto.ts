import { IsString, IsOptional, IsArray, IsNumber, Min, Max } from 'class-validator';

export class GenerateDatasetDto {
  @IsString()
  scenarioId!: string;

  @IsString()
  promptId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  personaIds?: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  count?: number;
}
