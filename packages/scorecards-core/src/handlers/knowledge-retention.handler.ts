import {
  ScorecardCriteria,
  KnowledgeRetentionCriteriaSettings,
  isBooleanThreshold,
  isNumericalThreshold,
} from '../schemas';
import {
  CriteriaHandler,
  CriteriaHandlerResult,
  EvaluationContext,
} from './criteria-handler.interface';
import { checkThreshold } from './scoring-utils';

export class KnowledgeRetentionHandler implements CriteriaHandler {
  readonly type = 'knowledge_retention';

  async evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult> {
    const settings = criteria.settings as KnowledgeRetentionCriteriaSettings;
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
          'Review the multi-turn conversation and identify specific facts, names, products, order numbers, or details the customer mentioned. Did the agent correctly reference or recall these details in subsequent turns without asking the customer to repeat? Score 1-10 where 10 means perfect retention of all customer-provided information.',
        evaluationType,
        transcript: context.transcriptText,
        threshold: thresholdInfo,
      });

      return {
        result: llmResult.result,
        passed: llmResult.passed ?? checkThreshold(criteria, llmResult.result),
        reasoning: llmResult.reasoning || 'Knowledge retention evaluation completed.',
        evidence: llmResult.evidence || [],
      };
    } catch (error: any) {
      return {
        result: 5,
        passed: false,
        reasoning: `Knowledge retention evaluation failed: ${error.message}. Using fallback.`,
        evidence: [],
      };
    }
  }
}
