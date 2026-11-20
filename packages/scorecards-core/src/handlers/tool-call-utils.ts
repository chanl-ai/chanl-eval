import { EvaluationContext } from './criteria-handler.interface';

export interface NormalizedToolCall {
  /** 1-based position in the order the agent made the calls. */
  index: number;
  name: string;
  args: Record<string, any>;
  result: any;
  turn?: number;
}

/**
 * One shape for tool calls whatever the provider sent: the name may sit on `name` or
 * `function.name`, and arguments may be an object or a JSON string on `function.arguments`.
 */
export function normalizeToolCalls(
  toolCalls: EvaluationContext['toolCalls'],
): NormalizedToolCall[] {
  return (toolCalls || []).map((tc, i) => ({
    index: i + 1,
    name: tc.name || tc.function?.name || '',
    args: parseArgs(tc.arguments ?? tc.function?.arguments),
    result: tc.result,
    turn: tc.turn,
  }));
}

function parseArgs(raw: unknown): Record<string, any> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? (raw as Record<string, any>) : {};
}

export function describeCall(call: NormalizedToolCall): string {
  const where = call.turn ? ` (turn ${call.turn})` : '';
  return `${call.name}(${JSON.stringify(call.args)})${where}`;
}

/**
 * A mocked or real tool result that reports failure. Mock fixtures return `{ error: ... }` for an
 * unknown tool or unmatched arguments; real tools tend to say "not found" or "mismatch" in text.
 */
export function resultLooksFailed(result: unknown): boolean {
  if (result == null) return true;
  if (typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if (r.error || r.success === false || r.found === false || r.verified === false || r.match === false) {
      return true;
    }
  }
  const text = (typeof result === 'string' ? result : JSON.stringify(result)).toLowerCase();
  return /\berror\b|not found|no match|mismatch|does not match|failed|invalid|denied/.test(text);
}
