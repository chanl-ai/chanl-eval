import {
  ScorecardCriteria,
  PromptCriteriaSettings,
  isBooleanThreshold,
  isNumericalThreshold,
} from '../schemas';
import {
  CriteriaHandler,
  CriteriaHandlerResult,
  EvaluationContext,
} from './criteria-handler.interface';
import { checkThreshold } from './scoring-utils';

export class PromptHandler implements CriteriaHandler {
  readonly type = 'prompt';

  async evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult> {
    const settings = criteria.settings as PromptCriteriaSettings;
    const evaluationType = settings.evaluationType || 'boolean';

    // No LLM available — return fallback
    if (!context.llmEvaluate) {
      const fallbackResult = evaluationType === 'boolean' ? false : 5;
      return {
        result: fallbackResult,
        passed: false,
        reasoning: 'No LLM evaluator available. Using fallback value.',
        evidence: [],
      };
    }

    // No transcript text — return fallback
    if (!context.transcriptText || context.transcriptText.trim() === '') {
      const fallbackResult = evaluationType === 'boolean' ? false : 5;
      return {
        result: fallbackResult,
        passed: false,
        reasoning: 'No transcript available for evaluation.',
        evidence: [],
      };
    }

    // Build threshold info for LLM
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
        description: settings.description,
        evaluationType,
        transcript: context.transcriptText,
        threshold: thresholdInfo,
      });

      return {
        result: llmResult.result,
        passed: llmResult.passed ?? checkThreshold(criteria, llmResult.result),
        reasoning: llmResult.reasoning || 'LLM evaluation completed.',
        evidence: llmResult.evidence || [],
      };
    } catch (error: any) {
      const fallbackResult = evaluationType === 'boolean' ? false : 5;
      return {
        result: fallbackResult,
        passed: false,
        reasoning: `LLM evaluation failed: ${error.message}. Using fallback.`,
        evidence: [],
      };
    }
  }
}
