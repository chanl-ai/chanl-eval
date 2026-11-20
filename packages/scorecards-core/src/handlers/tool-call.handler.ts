import {
  ScorecardCriteria,
  ToolArgExpectation,
  ToolCallCriteriaSettings,
} from '../schemas';
import {
  CriteriaHandler,
  CriteriaHandlerResult,
  EvaluationContext,
} from './criteria-handler.interface';
import { describeCall, normalizeToolCalls, NormalizedToolCall } from './tool-call-utils';

/**
 * Checks whether the agent called (or never called) a tool, optionally with specific arguments.
 *
 * A run with zero tool calls is a real outcome here, not N/A: it fails `called` and passes
 * `never_called`. Reporting it as N/A would hide the most common failure, an agent that skipped
 * the lookup it was supposed to make.
 */
export class ToolCallHandler implements CriteriaHandler {
  readonly type = 'tool_call';

  async evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult> {
    const settings = criteria.settings as ToolCallCriteriaSettings;
    const expectedTools = (
      Array.isArray(settings.expectedTool) ? settings.expectedTool : [settings.expectedTool]
    ).filter(Boolean);
    const mode = settings.mode || 'called';
    const expectedArgs = settings.expectedArgs || {};
    const hasArgRules = Object.keys(expectedArgs).length > 0;

    const calls = normalizeToolCalls(context.toolCalls);
    if (settings.appliesWhen?.tool) {
      const scope = settings.appliesWhen;
      const inScope = calls.some(
        (c) => c.name === scope.tool && argsMatch(c, scope.args || {}).ok,
      );
      if (!inScope) {
        return {
          result: null,
          passed: true,
          notApplicable: true,
          reasoning: `Not applicable: no ${scope.tool} call matched this check's scope`,
          evidence: [],
        };
      }
    }
    const nameMatches = calls.filter((c) => expectedTools.includes(c.name));
    const fullMatches = nameMatches.filter((c) => argsMatch(c, expectedArgs).ok);
    const toolList = expectedTools.join(', ');

    if (mode === 'never_called') {
      const hit = (hasArgRules ? fullMatches : nameMatches)[0];
      if (hit) {
        return {
          result: false,
          passed: false,
          reasoning: `Forbidden tool ${hit.name} was called${hit.turn ? ` in turn ${hit.turn}` : ''}`,
          evidence: [`Called: ${describeCall(hit)}`],
        };
      }
      return {
        result: true,
        passed: true,
        reasoning: `Tool(s) never called: ${toolList}`,
        evidence: [],
      };
    }

    if (fullMatches.length > 0) {
      return {
        result: true,
        passed: true,
        reasoning: `Expected tool(s) called: ${toolList}`,
        evidence: [`Called: ${describeCall(fullMatches[0])}`],
      };
    }

    if (calls.length === 0) {
      return {
        result: false,
        passed: false,
        reasoning: `Expected tool(s) NOT called: ${toolList}. The agent made no tool calls.`,
        evidence: ['No tool calls in this conversation'],
      };
    }

    if (nameMatches.length > 0) {
      const mismatch = argsMatch(nameMatches[0], expectedArgs);
      return {
        result: false,
        passed: false,
        reasoning: `${nameMatches[0].name} was called with the wrong arguments: ${mismatch.problems.join('; ')}`,
        evidence: nameMatches.slice(0, 3).map((c) => `Called: ${describeCall(c)}`),
      };
    }

    return {
      result: false,
      passed: false,
      reasoning: `Expected tool(s) NOT called: ${toolList}`,
      evidence: calls.slice(0, 5).map((c) => `Called instead: ${describeCall(c)}`),
    };
  }
}

function argsMatch(
  call: NormalizedToolCall,
  expected: Record<string, ToolArgExpectation>,
): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  for (const [arg, rule] of Object.entries(expected)) {
    const actual = call.args[arg];
    if (!argMatches(actual, rule)) {
      problems.push(
        `${arg} expected ${rule.op} ${JSON.stringify(rule.value)}, got ${actual === undefined ? 'nothing' : JSON.stringify(actual)}`,
      );
    }
  }
  return { ok: problems.length === 0, problems };
}

function argMatches(actual: unknown, rule: ToolArgExpectation): boolean {
  if (actual === undefined || actual === null) return false;
  const actualText = typeof actual === 'string' ? actual : JSON.stringify(actual);
  switch (rule.op) {
    case 'equals':
      if (typeof rule.value === 'string' || typeof actual === 'string') {
        return actualText.trim().toLowerCase() === String(rule.value).trim().toLowerCase();
      }
      return JSON.stringify(actual) === JSON.stringify(rule.value);
    case 'contains':
      return actualText.toLowerCase().includes(String(rule.value).toLowerCase());
    case 'regex':
      try {
        return new RegExp(String(rule.value), 'i').test(actualText);
      } catch {
        return false;
      }
    default:
      return false;
  }
}
