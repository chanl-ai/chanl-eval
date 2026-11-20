import { ScorecardCriteria, ToolOrderCriteriaSettings } from '../schemas';
import {
  CriteriaHandler,
  CriteriaHandlerResult,
  EvaluationContext,
} from './criteria-handler.interface';
import { describeCall, normalizeToolCalls, resultLooksFailed } from './tool-call-utils';

/**
 * Checks that `then` is never called before a `first` call, e.g. verify identity before refund.
 * A run that never calls `then` passes: the guarded action did not happen.
 */
export class ToolOrderHandler implements CriteriaHandler {
  readonly type = 'tool_order';

  async evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult> {
    // Default on: "A before B" almost always means "B only after A worked" (verify, then refund).
    const { first, then, requireFirstSuccess = true } =
      criteria.settings as ToolOrderCriteriaSettings;
    const calls = normalizeToolCalls(context.toolCalls);
    const order = calls.length
      ? calls.map((c) => `${c.index}. ${describeCall(c)}`)
      : ['No tool calls in this conversation'];

    const thenIdx = calls.findIndex((c) => c.name === then);
    if (thenIdx === -1) {
      return {
        result: true,
        passed: true,
        reasoning: `${then} was never called, so the order holds`,
        evidence: order,
      };
    }

    const firstCalls = calls.slice(0, thenIdx).filter((c) => c.name === first);
    if (firstCalls.length === 0) {
      return {
        result: false,
        passed: false,
        reasoning: `${then} was called before ${first}`,
        evidence: order,
      };
    }

    if (requireFirstSuccess && firstCalls.every((c) => resultLooksFailed(c.result))) {
      return {
        result: false,
        passed: false,
        reasoning: `${then} was called although ${first} did not succeed`,
        evidence: [
          ...order,
          `${first} result: ${JSON.stringify(firstCalls[firstCalls.length - 1].result)}`,
        ],
      };
    }

    return {
      result: true,
      passed: true,
      reasoning: `${first} was called before ${then}`,
      evidence: order,
    };
  }
}
