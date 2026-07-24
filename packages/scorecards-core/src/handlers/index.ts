export {
  CriteriaHandler,
  CriteriaHandlerResult,
  EvaluationContext,
} from './criteria-handler.interface';
export { CriteriaHandlerRegistry } from './criteria-handler-registry';
export { checkThreshold, normalizeScore } from './scoring-utils';

// Built-in handlers (text-only — voice handlers removed for OSS)
export { HallucinationHandler } from './hallucination.handler';
export { KeywordHandler } from './keyword.handler';
export { PatternHandler } from './pattern.handler';
export {
  PATTERN_LIBRARY,
  PATTERN_PRESET_NAMES,
  isPatternPresetName,
  resolvePresets,
} from './pattern-library';
export type { PatternPresetName, LibraryPattern } from './pattern-library';
export { PromptHandler } from './prompt.handler';
export { RagFaithfulnessHandler } from './rag-faithfulness.handler';
export { ResponseTimeHandler } from './response-time.handler';
export { ToolCallHandler } from './tool-call.handler';

// Multi-turn conversation metric handlers
export { KnowledgeRetentionHandler } from './knowledge-retention.handler';
export { ConversationCompletenessHandler } from './conversation-completeness.handler';
export { RoleAdherenceHandler } from './role-adherence.handler';
