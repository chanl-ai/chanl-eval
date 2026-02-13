import { ScorecardCriteria } from '../schemas';
import {
  CriteriaHandler,
  CriteriaHandlerResult,
  EvaluationContext,
} from './criteria-handler.interface';
import { checkThreshold } from './scoring-utils';

export class SilenceDurationHandler implements CriteriaHandler {
  readonly type = 'silence_duration';

  async evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult> {
    if (!context.metrics?.silence) {
      return {
        result: 0,
        passed: true,
        reasoning: 'No silence data available.',
        evidence: [],
      };
    }

    const totalSilence = context.metrics.silence.total ?? 0;
    const maxSilence = context.metrics.silence.max ?? 0;
    const avgSilence = context.metrics.silence.average ?? 0;

    const passed = checkThreshold(criteria, totalSilence);

    return {
      result: totalSilence,
      passed,
      reasoning: `Total silence: ${totalSilence.toFixed(1)}s (max: ${maxSilence.toFixed(1)}s, avg: ${avgSilence.toFixed(1)}s)`,
      evidence: [],
    };
  }
}
