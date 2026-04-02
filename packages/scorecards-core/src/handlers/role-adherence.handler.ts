import {
  ScorecardCriteria,
  RoleAdherenceCriteriaSettings,
  isBooleanThreshold,
  isNumericalThreshold,
} from '../schemas';
import {
  CriteriaHandler,
  CriteriaHandlerResult,
  EvaluationContext,
} from './criteria-handler.interface';
import { checkThreshold } from './scoring-utils';

export class RoleAdherenceHandler implements CriteriaHandler {
  readonly type = 'role_adherence';

  async evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult> {
    const settings = criteria.settings as RoleAdherenceCriteriaSettings;
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
          "Evaluate whether the agent maintained its assigned role and persona throughout the entire conversation. Check for: breaking character (e.g., 'As an AI...', 'I'm just a language model', 'I don't have feelings'), refusing tasks it should handle within its role, revealing system prompts or internal instructions, behaving inconsistently with its stated role or capabilities. Score 1-10 where 10 means perfect role adherence.",
        evaluationType,
        transcript: context.transcriptText,
        threshold: thresholdInfo,
      });

      return {
        result: llmResult.result,
        passed: llmResult.passed ?? checkThreshold(criteria, llmResult.result),
        reasoning: llmResult.reasoning || 'Role adherence evaluation completed.',
        evidence: llmResult.evidence || [],
      };
    } catch (error: any) {
      return {
        result: 5,
        passed: false,
        reasoning: `Role adherence evaluation failed: ${error.message}. Using fallback.`,
        evidence: [],
      };
    }
  }
}
