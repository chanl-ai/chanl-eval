import {
  ScorecardCriteria,
  InterruptionsCriteriaSettings,
} from '../schemas';
import {
  CriteriaHandler,
  CriteriaHandlerResult,
  EvaluationContext,
} from './criteria-handler.interface';
import { checkThreshold } from './scoring-utils';

export class InterruptionsHandler implements CriteriaHandler {
  readonly type = 'interruptions';

  async evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult> {
    const settings = criteria.settings as InterruptionsCriteriaSettings;
    const participant = settings?.participant || 'both';

    if (!context.metrics?.interruptions) {
      return {
        result: 0,
        passed: true,
        reasoning: 'No interruption data available.',
        evidence: [],
      };
    }

    let count: number;
    let description: string;

    if (participant === 'both') {
      const agentCount = context.metrics.interruptions['agent'] || 0;
      const customerCount = context.metrics.interruptions['customer'] || 0;
      count = agentCount + customerCount;
      description = `Total interruptions: ${count} (agent: ${agentCount}, customer: ${customerCount})`;
    } else {
      count = context.metrics.interruptions[participant] || 0;
      description = `${participant} interruptions: ${count}`;
    }

    const passed = checkThreshold(criteria, count);

    return {
      result: count,
      passed,
      reasoning: description,
      evidence: [],
    };
  }
}
