import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScorecardsController } from './scorecards.controller';
import { ScorecardsService } from './scorecards.service';
import { Scorecard, ScorecardSchema } from './schemas/scorecard.schema';
import {
  ScorecardCategory,
  ScorecardCategorySchema,
} from './schemas/scorecard-category.schema';
import {
  ScorecardCriteria,
  ScorecardCriteriaSchema,
} from './schemas/scorecard-criteria.schema';
import {
  ScorecardResult,
  ScorecardResultSchema,
} from './schemas/scorecard-result.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Scorecard.name, schema: ScorecardSchema },
      { name: ScorecardCategory.name, schema: ScorecardCategorySchema },
      { name: ScorecardCriteria.name, schema: ScorecardCriteriaSchema },
      { name: ScorecardResult.name, schema: ScorecardResultSchema },
    ]),
  ],
  controllers: [ScorecardsController],
  providers: [ScorecardsService],
  exports: [ScorecardsService],
})
export class ScorecardsModule {}
