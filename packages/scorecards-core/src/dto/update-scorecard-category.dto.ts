import { PartialType } from '@nestjs/mapped-types';
import { CreateScorecardCategoryDto } from './create-scorecard-category.dto';

export class UpdateScorecardCategoryDto extends PartialType(
  CreateScorecardCategoryDto,
) {}
