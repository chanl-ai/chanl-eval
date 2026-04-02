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
import { CriteriaHandlerRegistry } from './handlers/criteria-handler-registry';
import {
  HallucinationHandler,
  KeywordHandler,
  PromptHandler,
  RagFaithfulnessHandler,
  ResponseTimeHandler,
  ToolCallHandler,
  KnowledgeRetentionHandler,
  ConversationCompletenessHandler,
  RoleAdherenceHandler,
} from './handlers';
import { EvaluationService } from './evaluation/evaluation.service';

function createCriteriaHandlerRegistry(): CriteriaHandlerRegistry {
  const registry = new CriteriaHandlerRegistry();
  registry.register(new HallucinationHandler());
  registry.register(new KeywordHandler());
  registry.register(new PromptHandler());
  registry.register(new ResponseTimeHandler());
  registry.register(new RagFaithfulnessHandler());
  registry.register(new ToolCallHandler());
  registry.register(new KnowledgeRetentionHandler());
  registry.register(new ConversationCompletenessHandler());
  registry.register(new RoleAdherenceHandler());
  return registry;
}

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
  providers: [
    ScorecardsService,
    {
      provide: CriteriaHandlerRegistry,
      useFactory: createCriteriaHandlerRegistry,
    },
    EvaluationService,
  ],
  exports: [ScorecardsService, EvaluationService, CriteriaHandlerRegistry],
})
export class ScorecardsModule {}
