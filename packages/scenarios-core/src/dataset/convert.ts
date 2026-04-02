/**
 * Converts execution stepResults into a normalized ConversationRecord
 * suitable for format-specific exporters.
 *
 * This is the bridge between chanl-eval's internal transcript format
 * and the universal training data formats.
 */

import type { StepResult } from '../scenarios/schemas/scenario-execution.schema';
import type {
  ConversationRecord,
  ConversationMessage,
  ConversationMetadata,
  ToolDefinition,
} from './types';

export interface ConvertOptions {
  /** The system prompt of the agent under test */
  systemPrompt?: string;
  /** Tool definitions used during the conversation */
  tools?: ToolDefinition[];
  /** Metadata about the execution */
  metadata: ConversationMetadata;
}

/**
 * Convert an array of StepResults (from a completed execution) into
 * a normalized ConversationRecord for dataset export.
 *
 * Mapping:
 *  - role: 'persona'  → role: 'user'
 *  - role: 'agent'    → role: 'assistant'
 *  - role: 'tool'     → split into assistant tool_call + tool result messages
 */
export function stepResultsToConversation(
  stepResults: StepResult[],
  options: ConvertOptions,
): ConversationRecord {
  const messages: ConversationMessage[] = [];
  let toolCallCounter = 0;

  for (let i = 0; i < stepResults.length; i++) {
    const step = stepResults[i];
    if (!step.actualResponse && !step.toolCalls?.length) continue;

    switch (step.role) {
      case 'persona':
        messages.push({
          role: 'user',
          content: step.actualResponse || '',
        });
        break;

      case 'agent':
        messages.push({
          role: 'assistant',
          content: step.actualResponse || '',
        });
        break;

      case 'tool': {
        // Tool steps contain both the call and result.
        // We need to emit:
        //  1. An assistant message with tool_calls (if not already emitted)
        //  2. A tool result message for each call
        if (step.toolCalls?.length) {
          for (const tc of step.toolCalls) {
            const callId = `call_${++toolCallCounter}`;

            // Check if the previous message is an assistant with tool_calls
            // that already includes this call — avoid duplicating
            const prev = messages[messages.length - 1];
            if (prev?.role === 'assistant' && prev.toolCalls?.some((c) => c.name === tc.name)) {
              // Already have the assistant tool call, just add the result
              const existingCall = prev.toolCalls!.find((c) => c.name === tc.name);
              messages.push({
                role: 'tool',
                content: typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result ?? {}),
                toolCallId: existingCall?.id || callId,
              });
            } else {
              // Emit assistant message with tool_calls
              messages.push({
                role: 'assistant',
                content: '',
                toolCalls: [{
                  id: callId,
                  name: tc.name,
                  arguments: tc.arguments || {},
                }],
              });
              // Emit tool result
              messages.push({
                role: 'tool',
                content: typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result ?? {}),
                toolCallId: callId,
              });
            }
          }
        }
        break;
      }

      default:
        // Skip unknown roles
        break;
    }
  }

  return {
    messages,
    systemPrompt: options.systemPrompt,
    tools: options.tools,
    metadata: options.metadata,
  };
}
