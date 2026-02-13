// @chanl-ai/scorecards-core

// Module
export { ScorecardsModule } from './scorecards.module';

// Service
export { ScorecardsService, PaginatedResponse } from './scorecards.service';

// Controller
export { ScorecardsController } from './scorecards.controller';

// Schemas
export {
  Scorecard,
  ScorecardDocument,
  ScorecardSchema,
  ScorecardCategory,
  ScorecardCategoryDocument,
  ScorecardCategorySchema,
  ScorecardCriteria,
  ScorecardCriteriaDocument,
  ScorecardCriteriaSchema,
  ScorecardResult,
  ScorecardResultDocument,
  ScorecardResultSchema,
  CriteriaType,
  CriteriaSettings,
  PromptCriteriaSettings,
  KeywordCriteriaSettings,
  ResponseTimeCriteriaSettings,
  TalkTimeCriteriaSettings,
  SilenceDurationCriteriaSettings,
  InterruptionsCriteriaSettings,
  ToolCallCriteriaSettings,
  Threshold,
  BooleanThreshold,
  NumericalThreshold,
  PercentageThreshold,
  isPromptSettings,
  isKeywordSettings,
  isBooleanThreshold,
  isNumericalThreshold,
  isPercentageThreshold,
  getEvaluationType,
  CriteriaResult,
  AnalysisMetadata,
} from './schemas';

// DTOs
export {
  CreateScorecardDto,
  UpdateScorecardDto,
  CreateScorecardCategoryDto,
  UpdateScorecardCategoryDto,
  CreateScorecardCriteriaDto,
  UpdateScorecardCriteriaDto,
  CreateScorecardResultDto,
} from './dto';

// Handlers
export {
  CriteriaHandler,
  CriteriaHandlerResult,
  EvaluationContext,
  CriteriaHandlerRegistry,
  checkThreshold,
  normalizeScore,
  KeywordHandler,
  PromptHandler,
  ResponseTimeHandler,
  TalkTimeHandler,
  SilenceDurationHandler,
  InterruptionsHandler,
  ToolCallHandler,
} from './handlers';

// Evaluation
export {
  EvaluationService,
  EvaluateOptions,
  EvaluationResult,
} from './evaluation';
