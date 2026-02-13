import { PartialType } from '@nestjs/mapped-types';
import { CreateScorecardDto } from './create-scorecard.dto';

export class UpdateScorecardDto extends PartialType(CreateScorecardDto) {}
