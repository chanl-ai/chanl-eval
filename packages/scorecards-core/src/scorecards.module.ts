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
import { HumanLabel, HumanLabelSchema } from './schemas/human-label.schema';
import { LabelsService } from './labels/labels.service';
import { LabelsController } from './labels/labels.controller';
import { CriteriaHandlerRegistry } from './handlers/criteria-handler-registry';
import {
  HallucinationHandler,
  KeywordHandler,
  PatternHandler,
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
  registry.register(new PatternHandler());
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
      { name: HumanLabel.name, schema: HumanLabelSchema },
    ]),
  ],
  controllers: [ScorecardsController, LabelsController],
  providers: [
    ScorecardsService,
    {
      provide: CriteriaHandlerRegistry,
      useFactory: createCriteriaHandlerRegistry,
    },
    EvaluationService,
    LabelsService,
  ],
  exports: [
    ScorecardsService,
    EvaluationService,
    CriteriaHandlerRegistry,
    LabelsService,
  ],
})
export class ScorecardsModule {}
