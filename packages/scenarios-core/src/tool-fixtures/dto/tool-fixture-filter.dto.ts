import { IsOptional, IsString, IsBoolean, IsArray } from 'class-validator';

export class ToolFixtureFilterDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  search?: string;
}
