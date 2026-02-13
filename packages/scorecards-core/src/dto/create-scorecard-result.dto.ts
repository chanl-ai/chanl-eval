import { IsString, IsOptional } from 'class-validator';

export class CreateScorecardResultDto {
  @IsString()
  scorecardId!: string;

  @IsOptional()
  @IsString()
  callId?: string;

  @IsOptional()
  @IsString()
  audioId?: string;

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsString()
  scenarioExecutionId?: string;
}
