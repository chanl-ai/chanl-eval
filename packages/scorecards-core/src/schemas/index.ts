export {
  Scorecard,
  ScorecardDocument,
  ScorecardSchema,
} from './scorecard.schema';

export {
  ScorecardCategory,
  ScorecardCategoryDocument,
  ScorecardCategorySchema,
} from './scorecard-category.schema';

export {
  ScorecardCriteria,
  ScorecardCriteriaDocument,
  ScorecardCriteriaSchema,
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
} from './scorecard-criteria.schema';

export {
  ScorecardResult,
  ScorecardResultDocument,
  ScorecardResultSchema,
  CriteriaResult,
  AnalysisMetadata,
} from './scorecard-result.schema';
