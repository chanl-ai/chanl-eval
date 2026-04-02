/**
 * OpenAI Chat Completion fine-tuning format.
 *
 * Produces JSONL where each line is:
 *   {"messages": [{"role": "system", ...}, {"role": "user", ...}, {"role": "assistant", ...}]}
 *
 * With tools (openai-tools format), also includes:
 *   {"tools": [...], "messages": [...assistant with tool_calls..., ...tool results...]}
 *
 * Compatible with: OpenAI, Together AI, Fireworks, Axolotl, Unsloth, LLaMA Factory.
 *
 * Spec: https://platform.openai.com/docs/guides/supervised-fine-tuning
 */

import type { ConversationRecord, OpenAIChatLine } from '../types';

export interface OpenAIFormatOptions {
  /** Include tool definitions and tool call messages */
  includeTools?: boolean;
  /** Override system prompt. Pass null to omit. */
  systemPrompt?: string | null;
}

/**
 * Convert a ConversationRecord to an OpenAI fine-tuning JSONL line.
 */
export function toOpenAIChat(
  record: ConversationRecord,
  options: OpenAIFormatOptions = {},
): OpenAIChatLine {
  const includeTools = options.includeTools ?? false;
  const systemPrompt = options.systemPrompt !== undefined
    ? options.systemPrompt
    : record.systemPrompt;

  const messages: OpenAIChatLine['messages'] = [];

  // System prompt
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of record.messages) {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content });
      continue;
    }

    if (msg.role === 'assistant') {
      if (msg.toolCalls?.length && includeTools) {
        // Assistant message with tool calls — no text content per OpenAI spec
        messages.push({
          role: 'assistant',
          content: msg.content || undefined,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              // OpenAI requires arguments as JSON STRING, not object
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        });
      } else if (msg.toolCalls?.length && !includeTools) {
        // Strip tool calls — skip this message (tool interaction hidden)
        // The next text-only assistant message will be included
        if (msg.content) {
          messages.push({ role: 'assistant', content: msg.content });
        }
      } else {
        messages.push({ role: 'assistant', content: msg.content });
      }
      continue;
    }

    if (msg.role === 'tool' && includeTools) {
      messages.push({
        role: 'tool',
        content: msg.content,
        tool_call_id: msg.toolCallId,
      });
      continue;
    }

    // Skip tool messages when not including tools
  }

  // Strip tool-call-only assistant messages that have no content and no tool_calls
  // (happens when includeTools=false strips tool_calls from empty assistant msgs)
  const cleaned = messages.filter(
    (m) => m.content || m.tool_calls?.length,
  );

  const line: OpenAIChatLine = { messages: cleaned };

  // Add tool definitions when including tools
  if (includeTools && record.tools?.length) {
    line.tools = record.tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  return line;
}

/**
 * Serialize to JSONL string (one line).
 */
export function toOpenAIChatJsonl(
  record: ConversationRecord,
  options: OpenAIFormatOptions = {},
): string {
  return JSON.stringify(toOpenAIChat(record, options));
}
