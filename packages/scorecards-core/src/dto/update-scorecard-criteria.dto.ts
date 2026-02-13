import { PartialType } from '@nestjs/mapped-types';
import { CreateScorecardCriteriaDto } from './create-scorecard-criteria.dto';

export class UpdateScorecardCriteriaDto extends PartialType(
  CreateScorecardCriteriaDto,
) {}
