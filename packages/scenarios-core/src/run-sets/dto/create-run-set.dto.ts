import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { RUN_SET_KINDS, RunSetKind } from '../schemas/run-set.schema';

export class CreateRunSetDto {
  @IsIn(RUN_SET_KINDS)
  kind!: RunSetKind;

  @IsString()
  scenarioId!: string;

  @IsString()
  promptId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  personaIds!: string[];

  @IsOptional()
  @IsString()
  scorecardId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  toolFixtureIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  k?: number;

  @IsOptional()
  @IsString()
  baselineRunSetId?: string;
}

export class ListRunSetsQuery {
  @IsOptional()
  @IsString()
  scenarioId?: string;

  @IsOptional()
  @IsString()
  promptId?: string;

  @IsOptional()
  @IsIn(RUN_SET_KINDS)
  kind?: RunSetKind;
}
