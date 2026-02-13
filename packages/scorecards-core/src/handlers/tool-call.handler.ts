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
    const evidence: string[] = [];

    const found = expectedTools.some((tool) =>
      toolCalls.some((tc) => {
        const match =
          tc.name === tool || tc.function?.name === tool;
        if (match && evidence.length < 3) {
          evidence.push(
            `Tool called: ${tc.name || tc.function?.name}${tc.timestamp ? ` at ${tc.timestamp}` : ''}`,
          );
        }
        return match;
      }),
    );

    const reasoning = found
      ? `Expected tool(s) were called: ${expectedTools.join(', ')}`
      : `Expected tool(s) were NOT called: ${expectedTools.join(', ')}. Available calls: ${toolCalls.map((tc) => tc.name || tc.function?.name).filter(Boolean).join(', ') || 'none'}`;

    return {
      result: found,
      passed: found,
      reasoning,
      evidence,
    };
  }
}
