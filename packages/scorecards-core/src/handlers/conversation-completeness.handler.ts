import {
  ScorecardCriteria,
  ConversationCompletenessCriteriaSettings,
  isBooleanThreshold,
  isNumericalThreshold,
} from '../schemas';
import {
  CriteriaHandler,
  CriteriaHandlerResult,
  EvaluationContext,
} from './criteria-handler.interface';
import { checkThreshold } from './scoring-utils';

export class ConversationCompletenessHandler implements CriteriaHandler {
  readonly type = 'conversation_completeness';

  async evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult> {
    const settings = criteria.settings as ConversationCompletenessCriteriaSettings;
    const evaluationType = settings?.evaluationType || 'score';

    // No LLM available — return fallback
    if (!context.llmEvaluate) {
      return {
        result: 5,
        passed: false,
        reasoning: 'LLM evaluator not available',
        evidence: [],
      };
    }

    // Empty transcript — nothing to evaluate
    if (!context.transcriptText || context.transcriptText.trim() === '') {
      return {
        result: 5,
        passed: false,
        reasoning: 'Empty transcript',
        evidence: [],
      };
    }

    // Build threshold info for LLM (same pattern as prompt.handler)
    let thresholdInfo: {
      type: 'boolean' | 'numerical';
      expectedValue?: boolean;
      min?: number;
      max?: number;
    } | undefined;

    if (criteria.threshold) {
      if (isBooleanThreshold(criteria.threshold)) {
        thresholdInfo = {
          type: 'boolean',
          expectedValue: criteria.threshold.expectedValue,
        };
      } else if (isNumericalThreshold(criteria.threshold)) {
        thresholdInfo = {
          type: 'numerical',
          min: criteria.threshold.min,
          max: criteria.threshold.max,
        };
      }
    }

    try {
      const llmResult = await context.llmEvaluate({
        criterionName: criteria.name,
        description:
          'Identify every distinct concern, question, or request the customer raised during this conversation. For each one, determine whether the agent fully addressed it, partially addressed it, or ignored it. Score 1-10 where 10 means every customer concern was fully resolved or acknowledged with a clear next step.',
        evaluationType,
        transcript: context.transcriptText,
        threshold: thresholdInfo,
      });

      return {
        result: llmResult.result,
        passed: llmResult.passed ?? checkThreshold(criteria, llmResult.result),
        reasoning: llmResult.reasoning || 'Conversation completeness evaluation completed.',
        evidence: llmResult.evidence || [],
      };
    } catch (error: any) {
      return {
        result: 5,
        passed: false,
        reasoning: `Conversation completeness evaluation failed: ${error.message}. Using fallback.`,
        evidence: [],
      };
    }
  }
}
