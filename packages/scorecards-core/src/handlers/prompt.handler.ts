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
        description:
          settings.rubric || settings.description || criteria.description || criteria.name,
        evaluationType,
        transcript: context.judgeTranscriptText || context.transcriptText,
        threshold: thresholdInfo,
        selfConsistency: settings.selfConsistency,
      });

      // The judge could not produce a verdict (transport error, unparseable response). That is a
      // fact about our infrastructure, not about the agent — report it as N/A so it is excluded from
      // scoring instead of quietly counting as a failure.
      if (llmResult.error) {
        return {
          result: null,
          passed: false,
          notApplicable: true,
          reasoning: `LLM judge unavailable: ${llmResult.error}. Criterion not scored.`,
          evidence: [],
        };
      }

      // A verdict the judge cannot back with a quote from the transcript is unverifiable, so it is
      // neither a pass nor a clean fail: a person has to read the conversation.
      const quotes = (llmResult.evidence || []).filter(
        (e) => typeof e === 'string' && e.trim().length > 0,
      );
      if (quotes.length === 0) {
        return {
          result: llmResult.result,
          passed: false,
          needsReview: true,
          reasoning: `Needs review: judge gave no quote. ${llmResult.reasoning || ''}`.trim(),
          evidence: [],
        };
      }

      return {
        result: llmResult.result,
        passed: judgePassed(llmResult, evaluationType, thresholdInfo, criteria),
        reasoning: llmResult.reasoning || 'LLM evaluation completed.',
        evidence: llmResult.evidence || [],
        ...(llmResult.confidence !== undefined
          ? { confidence: llmResult.confidence }
          : {}),
      };
    } catch (error: any) {
      return {
        result: null,
        passed: false,
        notApplicable: true,
        reasoning: `LLM evaluation failed: ${error.message}. Criterion not scored.`,
        evidence: [],
      };
    }
  }
}

/**
 * A yes/no judge answers the question as asked, so whether "yes" passes depends on the question:
 * "Does the agent avoid promising a refund?" passes on yes, "Did the agent reveal another
 * customer's data?" passes on no. The expected answer comes from the criterion's threshold
 * (default yes), never from the model, which would otherwise have to work out the polarity itself.
 */
function judgePassed(
  llmResult: { result: boolean | number | null; passed?: boolean },
  evaluationType: string,
  threshold: { type: 'boolean' | 'numerical'; expectedValue?: boolean } | undefined,
  criteria: ScorecardCriteria,
): boolean {
  if (evaluationType === 'boolean' && typeof llmResult.result === 'boolean') {
    const expected = threshold?.type === 'boolean' && threshold.expectedValue !== undefined
      ? threshold.expectedValue
      : true;
    return llmResult.result === expected;
  }
  return llmResult.passed ?? checkThreshold(criteria, llmResult.result);
}
