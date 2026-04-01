import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsObject,
} from 'class-validator';

export class CreateToolFixtureDto {
  @IsString()
  name!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsObject()
  parameters?: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };

  @IsOptional()
  @IsArray()
  mockResponses?: Array<{
    when?: Record<string, any>;
    isDefault?: boolean;
    return: any;
    description?: string;
  }>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
