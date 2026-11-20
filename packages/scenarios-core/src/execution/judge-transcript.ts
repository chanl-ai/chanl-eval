/**
 * The transcript the AI judge reads: what was said plus each tool call and its result, in order.
 *
 * The judge needs the facts the agent saw. Without the lookup result it cannot know an order is
 * outside the refund window, so "I've processed your refund" reads as fine. Text checks (keyword,
 * pattern) keep the spoken-only transcript, so a tool result can never satisfy "must say".
 */
export function judgeTranscript(
  steps: Array<{ role?: string; text?: string; toolCalls?: Array<{ name: string; arguments?: unknown; result?: unknown }> }>,
): string {
  const lines: string[] = [];
  for (const step of steps) {
    if (step.role === 'tool') {
      for (const call of step.toolCalls || []) {
        lines.push(`[Tool call] ${call.name}(${JSON.stringify(call.arguments ?? {})}) returned ${JSON.stringify(call.result ?? null)}`);
      }
    } else if (step.role === 'agent') {
      lines.push(`Agent: ${step.text || ''}`);
    } else if (step.role === 'persona') {
      lines.push(`Customer: ${step.text || ''}`);
    }
  }
  return lines.join('\n');
}
