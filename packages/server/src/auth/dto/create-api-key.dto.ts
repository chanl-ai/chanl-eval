import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApiKeyDto {
  @ApiPropertyOptional({ description: 'Human-readable name for the API key' })
  @IsOptional()
  @IsString()
  name?: string;
}
