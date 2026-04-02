import { IsString, IsOptional, IsObject, IsArray } from 'class-validator';

export class InstantiateTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  variableValues?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  personaIds?: string[];

  @IsOptional()
  @IsString()
  scorecardId?: string;
}
