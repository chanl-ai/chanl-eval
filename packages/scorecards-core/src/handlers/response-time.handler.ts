import { ScorecardCriteria, ResponseTimeCriteriaSettings } from '../schemas';
import {
  CriteriaHandler,
  CriteriaHandlerResult,
  EvaluationContext,
} from './criteria-handler.interface';
import { checkThreshold } from './scoring-utils';

export class ResponseTimeHandler implements CriteriaHandler {
  readonly type = 'response_time';

  async evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult> {
    const settings = criteria.settings as ResponseTimeCriteriaSettings;
    const participant = settings?.participant || 'agent';

    let responseTime: number | null = null;
    let source = '';

    // Primary: firstResponseLatency from metrics
    if (context.metrics?.firstResponseLatency !== undefined) {
      responseTime = context.metrics.firstResponseLatency;
      source = 'first response latency';
    }
    // Fallback: average segment length by participant
    else if (context.metrics?.avgSegmentLength?.[participant] !== undefined) {
      responseTime = context.metrics.avgSegmentLength[participant];
      source = `average ${participant} segment length`;
    }
    // Last resort: calculate from segments
    else if (context.segments && context.segments.length >= 2) {
      // Find first response from the participant
      for (let i = 1; i < context.segments.length; i++) {
        if (
          context.segments[i].speaker.toLowerCase().includes(participant) &&
          context.segments[i].startTime !== undefined &&
          context.segments[i - 1].endTime !== undefined
        ) {
          responseTime =
            context.segments[i].startTime! - context.segments[i - 1].endTime!;
          source = 'calculated from segments';
          break;
        }
      }
    }

    if (responseTime === null) {
      return {
        result: 0,
        passed: false,
        reasoning: 'No response time data available.',
        evidence: [],
      };
    }

    const passed = checkThreshold(criteria, responseTime);

    return {
      result: responseTime,
      passed,
      reasoning: `${participant} response time: ${responseTime.toFixed(1)}s (source: ${source})`,
      evidence: [],
    };
  }
}
