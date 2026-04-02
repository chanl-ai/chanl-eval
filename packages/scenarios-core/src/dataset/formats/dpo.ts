/**
 * DPO (Direct Preference Optimization) format converter.
 *
 * Produces JSONL where each line is a preference pair:
 *   {"input": {"messages": [...]}, "preferred_output": [...], "non_preferred_output": [...]}
 *
 * Compatible with: OpenAI DPO fine-tuning, Together AI preference, TRL DPOTrainer.
 *
 * DPO requires TWO executions of the same scenario — one scored higher than the other.
 * The higher-scored execution's assistant responses become preferred_output.
 *
 * Spec: https://platform.openai.com/docs/guides/direct-preference-optimization
 */

import type { ConversationRecord, DPOLine } from '../types';

export interface DPOFormatOptions {
  /** Override system prompt. Pass null to omit. */
  systemPrompt?: string | null;
  /**
   * Minimum score delta between preferred and non-preferred.
   * Pairs with less separation are skipped.
   * Default: 0 (include all pairs).
   */
  minScoreDelta?: number;
}

/**
 * Create a DPO preference pair from two ConversationRecords of the same scenario.
 *
 * The higher-scored conversation's assistant responses are preferred.
 * Returns null if the pair doesn't meet the minScoreDelta threshold.
 *
 * Strategy: Extract the LAST assistant response from each conversation
 * as the preference signal, with all preceding messages as shared input.
 * This works because both conversations start from the same scenario
 * (same persona opening → same initial user messages).
 */
export function toDPO(
  conversationA: ConversationRecord,
  conversationB: ConversationRecord,
  options: DPOFormatOptions = {},
): DPOLine | null {
  const scoreA = conversationA.metadata.score ?? 0;
  const scoreB = conversationB.metadata.score ?? 0;
  const minDelta = options.minScoreDelta ?? 0;

  // Ensure sufficient score separation
  if (Math.abs(scoreA - scoreB) < minDelta) {
    return null;
  }

  const [preferred, nonPreferred] = scoreA >= scoreB
    ? [conversationA, conversationB]
    : [conversationB, conversationA];

  const systemPrompt = options.systemPrompt !== undefined
    ? options.systemPrompt
    : preferred.systemPrompt;

  // Build shared input from user messages (persona turns)
  const inputMessages: DPOLine['input']['messages'] = [];
  if (systemPrompt) {
    inputMessages.push({ role: 'system', content: systemPrompt });
  }

  // Use the preferred conversation's user messages as the input context.
  // Both conversations should share similar user turns (same scenario+persona)
  // but the preferred one is canonical.
  for (const msg of preferred.messages) {
    if (msg.role === 'user') {
      inputMessages.push({ role: 'user', content: msg.content });
    }
  }

  // Extract all assistant responses from each conversation
  const preferredOutputs = preferred.messages
    .filter((m) => m.role === 'assistant' && m.content && !m.toolCalls?.length)
    .map((m) => ({ role: 'assistant' as const, content: m.content }));

  const nonPreferredOutputs = nonPreferred.messages
    .filter((m) => m.role === 'assistant' && m.content && !m.toolCalls?.length)
    .map((m) => ({ role: 'assistant' as const, content: m.content }));

  if (!preferredOutputs.length || !nonPreferredOutputs.length) {
    return null;
  }

  return {
    input: { messages: inputMessages },
    preferred_output: preferredOutputs,
    non_preferred_output: nonPreferredOutputs,
  };
}

/**
 * Serialize to JSONL string (one line).
 */
export function toDPOJsonl(
  conversationA: ConversationRecord,
  conversationB: ConversationRecord,
  options: DPOFormatOptions = {},
): string | null {
  const line = toDPO(conversationA, conversationB, options);
  return line ? JSON.stringify(line) : null;
}
