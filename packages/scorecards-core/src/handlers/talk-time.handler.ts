import { ScorecardCriteria, TalkTimeCriteriaSettings } from '../schemas';
import {
  CriteriaHandler,
  CriteriaHandlerResult,
  EvaluationContext,
} from './criteria-handler.interface';
import { checkThreshold } from './scoring-utils';

export class TalkTimeHandler implements CriteriaHandler {
  readonly type = 'talk_time';

  async evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult> {
    const settings = criteria.settings as TalkTimeCriteriaSettings;
    const participant = settings?.participant || 'agent';

    if (!context.metrics?.talkTime) {
      return {
        result: 0,
        passed: false,
        reasoning: 'No talk time data available.',
        evidence: [],
      };
    }

    let value: number;
    let description: string;

    const isRatio =
      participant === 'agent_ratio' || participant === 'customer_ratio';

    if (isRatio) {
      const baseParticipant = participant.replace('_ratio', '');
      const participantTime = context.metrics.talkTime[baseParticipant] || 0;
      const totalDuration = context.metrics.duration || 0;

      if (totalDuration === 0) {
        return {
          result: 0,
          passed: false,
          reasoning: 'No duration data available to calculate ratio.',
          evidence: [],
        };
      }

      value = (participantTime / totalDuration) * 100;
      description = `${baseParticipant} talk ratio: ${value.toFixed(1)}% (${participantTime.toFixed(1)}s / ${totalDuration.toFixed(1)}s)`;
    } else if (participant === 'both') {
      const agentTime = context.metrics.talkTime['agent'] || 0;
      const customerTime = context.metrics.talkTime['customer'] || 0;
      value = agentTime + customerTime;
      description = `Total talk time: ${value.toFixed(1)}s (agent: ${agentTime.toFixed(1)}s, customer: ${customerTime.toFixed(1)}s)`;
    } else {
      value = context.metrics.talkTime[participant] || 0;
      description = `${participant} talk time: ${value.toFixed(1)}s`;
    }

    const passed = checkThreshold(criteria, value);

    return {
      result: value,
      passed,
      reasoning: description,
      evidence: [],
    };
  }
}
