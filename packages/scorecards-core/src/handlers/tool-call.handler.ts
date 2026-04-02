import { ScorecardCriteria, ToolCallCriteriaSettings } from '../schemas';
import {
  CriteriaHandler,
  CriteriaHandlerResult,
  EvaluationContext,
} from './criteria-handler.interface';

export class ToolCallHandler implements CriteriaHandler {
  readonly type = 'tool_call';

  async evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult> {
    const settings = criteria.settings as ToolCallCriteriaSettings;
    const expectedTools = Array.isArray(settings.expectedTool)
      ? settings.expectedTool
      : [settings.expectedTool];

    const toolCalls = context.toolCalls || [];

    // No tools were available in the conversation — can't evaluate tool usage
    if (toolCalls.length === 0) {
      return {
        result: true,
        passed: true,
        reasoning: 'No tools available in this conversation',
        evidence: [],
        notApplicable: true,
      };
    }

    const evidence: string[] = [];
    const found = expectedTools.some((tool) =>
      toolCalls.some((tc) => {
        const match =
          tc.name === tool || tc.function?.name === tool;
        if (match && evidence.length < 2) {
          evidence.push(`Called: ${tc.name || tc.function?.name}`);
        }
        return match;
      }),
    );

    return {
      result: found,
      passed: found,
      reasoning: found
        ? `Expected tool(s) called: ${expectedTools.join(', ')}`
        : `Expected tool(s) NOT called: ${expectedTools.join(', ')}`,
      evidence,
    };
  }
}
