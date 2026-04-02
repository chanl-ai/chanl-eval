import {
  ScorecardCriteria,
  HallucinationCriteriaSettings,
  isBooleanThreshold,
  isNumericalThreshold,
} from '../schemas';
import {
  CriteriaHandler,
  CriteriaHandlerResult,
  EvaluationContext,
} from './criteria-handler.interface';
import { checkThreshold } from './scoring-utils';

export class HallucinationHandler implements CriteriaHandler {
  readonly type = 'hallucination';

  async evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult> {
    const settings = criteria.settings as HallucinationCriteriaSettings;
    const evaluationType = settings?.evaluationType || 'boolean';

    // No ground truth — nothing to check against
    if (!context.groundTruth) {
      return {
        result: true,
        passed: true,
        reasoning: 'No ground truth provided',
        evidence: [],
        notApplicable: true,
      };
    }

    // No LLM available — cannot evaluate
    if (!context.llmEvaluate) {
      return {
        result: false,
        passed: false,
        reasoning: 'LLM evaluator not available',
        evidence: [],
      };
    }

    // Empty transcript — nothing to evaluate
    if (!context.transcriptText || context.transcriptText.trim() === '') {
      return {
        result: true,
        passed: true,
        reasoning: 'Empty transcript — skipped',
        evidence: [],
      };
    }

    // Build enhanced transcript with ground truth prepended
    const enhancedTranscript = `## Ground Truth Facts\n${context.groundTruth}\n\n## Conversation Transcript\n${context.transcriptText}`;

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
          'Evaluate whether the agent\'s responses contradict, fabricate, or go beyond the provided ground truth facts. A hallucination is any claim not supported by the ground truth. Check each agent response against the ground truth and identify any fabricated information.',
        evaluationType,
        transcript: enhancedTranscript,
        threshold: thresholdInfo,
      });

      return {
        result: llmResult.result,
        passed: llmResult.passed ?? checkThreshold(criteria, llmResult.result),
        reasoning: llmResult.reasoning || 'Hallucination evaluation completed.',
        evidence: llmResult.evidence || [],
      };
    } catch (error: any) {
      return {
        result: false,
        passed: false,
        reasoning: `Hallucination evaluation failed: ${error.message}`,
        evidence: [],
      };
    }
  }
}
