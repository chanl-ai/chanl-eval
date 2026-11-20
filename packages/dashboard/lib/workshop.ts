/**
 * Pure helpers behind the workshop flows. No React and no path aliases, so `node --test` can load
 * this file directly (tests/workshop.test.ts).
 */

/** Tags that every seeded record carries, so they say nothing about which agent fits a scenario. */
const GENERIC_TAGS = new Set(['workshop', 'red-team']);

interface Tagged {
  id: string;
  tags?: string[];
}

/**
 * The agent a scenario should run against. Scenarios have no agent field, so the seed links them
 * by a shared topic tag ("refunds", "invoices"). When several agents share the tag (a saved v2
 * copy keeps the original's tags), the last agent the person picked wins if it is one of them.
 */
export function agentForScenario(
  scenario: Tagged | undefined,
  agents: Tagged[],
  lastAgentId?: string | null,
): string | undefined {
  const topics = (scenario?.tags ?? []).filter((t) => !GENERIC_TAGS.has(t));
  const matches = agents.filter((a) => (a.tags ?? []).some((t) => topics.includes(t)));
  if (lastAgentId && matches.some((a) => a.id === lastAgentId)) return lastAgentId;
  if (matches.length > 0) return matches[0].id;
  if (lastAgentId && agents.some((a) => a.id === lastAgentId)) return lastAgentId;
  return undefined;
}

export type CheckChange = 'improved' | 'regressed' | 'same';

/** Fewer failed runs after the change is an improvement; more is a regression. */
export function compareChange(beforeFailed: number, afterFailed: number): CheckChange {
  if (afterFailed < beforeFailed) return 'improved';
  if (afterFailed > beforeFailed) return 'regressed';
  return 'same';
}

export interface ToolCallView {
  name: string;
  arguments: Record<string, unknown>;
  /** The mock tool's response; undefined when the run did not record one. */
  result: unknown;
}

function readCall(raw: Record<string, unknown>): ToolCallView {
  // The mock response has been stored under different keys over time.
  const result = raw.result ?? raw.mockResponse ?? raw.response ?? raw.output;
  let args = raw.arguments ?? raw.args ?? {};
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { args = { value: args }; }
  }
  return { name: String(raw.name ?? 'tool'), arguments: args as Record<string, unknown>, result };
}

type Step = Record<string, unknown> & { role?: string; actualResponse?: string; toolCalls?: unknown };

/**
 * Tool calls recorded on one step. Scenario runs store each call as its own `role: 'tool'` step;
 * chat stores them on the agent step that made them. Both shapes are read here.
 */
export function toolCallsFromStep(step: Step): ToolCallView[] {
  const calls = Array.isArray(step.toolCalls) ? (step.toolCalls as Record<string, unknown>[]) : [];
  if (calls.length > 0) return calls.map(readCall);
  if (step.role === 'tool' && step.actualResponse) {
    try {
      return [readCall(JSON.parse(step.actualResponse) as Record<string, unknown>)];
    } catch {
      return [{ name: 'tool', arguments: {}, result: step.actualResponse }];
    }
  }
  return [];
}

export interface ChatLine {
  role: 'persona' | 'agent' | 'tool';
  content: string;
  latencyMs?: number;
  toolCalls?: ToolCallView[];
}

/**
 * A run's steps as transcript lines, in order. An agent step that made tool calls is shown as the
 * tool calls followed by the agent's reply, so the reply reads in the light of what the tools said.
 */
export function stepsToLines(steps: Step[]): ChatLine[] {
  const lines: ChatLine[] = [];
  for (const step of steps) {
    const calls = toolCallsFromStep(step);
    if (step.role === 'tool') {
      if (calls.length > 0) lines.push({ role: 'tool', content: '', toolCalls: calls });
      continue;
    }
    if (calls.length > 0) lines.push({ role: 'tool', content: '', toolCalls: calls });
    if (step.actualResponse) {
      const isAgent = step.role === 'agent' || (typeof step.stepId === 'string' && step.stepId.includes('agent'));
      lines.push({
        role: isAgent ? 'agent' : 'persona',
        content: step.actualResponse,
        latencyMs: isAgent && typeof step.duration === 'number' ? step.duration : undefined,
      });
    }
  }
  return lines;
}

/**
 * The run's scorecard result as a percentage, or undefined when no scorecard judged it. The
 * execution's own `overallScore` is a completion score (100 for any finished run), so it is never
 * shown as a score.
 */
export function scorecardPercent(execution: { scorecardResults?: { overallScore?: number } | null } | undefined): number | undefined {
  const s = execution?.scorecardResults?.overallScore;
  // scorecards-core scores on a 0-10 scale.
  return typeof s === 'number' ? Math.round(s * 10) : undefined;
}

export function scorecardPassed(execution: { scorecardResults?: { passed?: boolean } | null } | undefined): boolean | undefined {
  const p = execution?.scorecardResults?.passed;
  return typeof p === 'boolean' ? p : undefined;
}

export function formatToolResult(result: unknown): string {
  if (result === undefined || result === null) return '';
  return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
}
