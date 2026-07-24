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
  PatternCriteriaSettings,
  ResponseTimeCriteriaSettings,
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
  PatternHandler,
  PATTERN_LIBRARY,
  PATTERN_PRESET_NAMES,
  isPatternPresetName,
  PromptHandler,
  ResponseTimeHandler,
  ToolCallHandler,
} from './handlers';
export type { PatternPresetName, LibraryPattern } from './handlers';

// Evaluation
export {
  EvaluationService,
  EvaluateOptions,
  EvaluationResult,
} from './evaluation';
