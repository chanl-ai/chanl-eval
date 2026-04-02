/**
 * ShareGPT format converter.
 *
 * Produces JSON where each conversation is:
 *   {"conversations": [{"from": "system", "value": "..."}, {"from": "human", "value": "..."}, {"from": "gpt", "value": "..."}]}
 *
 * Compatible with: LLaMA Factory, older Axolotl configs, many HuggingFace datasets.
 *
 * Note: ShareGPT doesn't have a standard way to represent tool calls.
 * Tool interactions are either omitted or inlined as text in the assistant message.
 */

import type { ConversationRecord, ShareGPTLine } from '../types';

export interface ShareGPTFormatOptions {
  /** Override system prompt. Pass null to omit. */
  systemPrompt?: string | null;
  /**
   * How to handle tool call messages.
   * - 'omit': skip tool interactions entirely (default)
   * - 'inline': include tool calls as formatted text in assistant messages
   */
  toolHandling?: 'omit' | 'inline';
}

/**
 * Convert a ConversationRecord to ShareGPT format.
 */
export function toShareGPT(
  record: ConversationRecord,
  options: ShareGPTFormatOptions = {},
): ShareGPTLine {
  const systemPrompt = options.systemPrompt !== undefined
    ? options.systemPrompt
    : record.systemPrompt;
  const toolHandling = options.toolHandling ?? 'omit';

  const conversations: ShareGPTLine['conversations'] = [];

  // System prompt
  if (systemPrompt) {
    conversations.push({ from: 'system', value: systemPrompt });
  }

  for (const msg of record.messages) {
    if (msg.role === 'user') {
      conversations.push({ from: 'human', value: msg.content });
      continue;
    }

    if (msg.role === 'assistant') {
      if (msg.toolCalls?.length && toolHandling === 'inline') {
        // Inline tool calls as text
        const toolText = msg.toolCalls
          .map((tc) => `[Tool Call: ${tc.name}(${JSON.stringify(tc.arguments)})]`)
          .join('\n');
        const content = msg.content
          ? `${msg.content}\n${toolText}`
          : toolText;
        conversations.push({ from: 'gpt', value: content });
      } else if (msg.toolCalls?.length && toolHandling === 'omit') {
        // Skip tool-call-only assistant messages
        if (msg.content) {
          conversations.push({ from: 'gpt', value: msg.content });
        }
      } else {
        conversations.push({ from: 'gpt', value: msg.content });
      }
      continue;
    }

    if (msg.role === 'tool' && toolHandling === 'inline') {
      // Inline tool results
      conversations.push({
        from: 'tool',
        value: msg.content,
      });
      continue;
    }

    // Skip tool messages when omitting
  }

  // Ensure alternating human/gpt by removing empty entries
  const cleaned = conversations.filter((c) => c.value);

  return { conversations: cleaned };
}

/**
 * Serialize to JSON string (one line for JSONL, or pretty for JSON array).
 */
export function toShareGPTJsonl(
  record: ConversationRecord,
  options: ShareGPTFormatOptions = {},
): string {
  return JSON.stringify(toShareGPT(record, options));
}
