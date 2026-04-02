/**
 * Dataset export types for converting execution transcripts
 * into training data formats (OpenAI, ShareGPT, DPO).
 */

// ---------------------------------------------------------------------------
// Input: normalized conversation extracted from execution stepResults
// ---------------------------------------------------------------------------

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  /** Present on assistant messages that invoked tools */
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
  /** Present on tool-result messages — references the tool call ID */
  toolCallId?: string;
}

import type { ToolDefinition } from '../adapters/agent-adapter.interface';
export type { ToolDefinition };

export interface ConversationMetadata {
  executionId: string;
  scenarioId: string;
  personaId?: string;
  score?: number;
  turnCount: number;
  duration?: number;
  tags?: string[];
  personaTraits?: Record<string, any>;
  scenarioName?: string;
  personaName?: string;
}

export interface ConversationRecord {
  messages: ConversationMessage[];
  systemPrompt?: string;
  tools?: ToolDefinition[];
  metadata: ConversationMetadata;
}

// ---------------------------------------------------------------------------
// Export format options
// ---------------------------------------------------------------------------

export type ExportFormat = 'openai' | 'openai-tools' | 'sharegpt' | 'dpo';

export interface ExportOptions {
  format: ExportFormat;
  /** Override or omit the system prompt. Pass 'omit' to exclude entirely. */
  systemPrompt?: string | 'omit';
  /** Filter: minimum scorecard score (0-100) */
  minScore?: number;
  /** Generate companion metadata.jsonl alongside training data */
  includeMetadata?: boolean;
}

// ---------------------------------------------------------------------------
// Output line types (what each format converter produces)
// ---------------------------------------------------------------------------

/** OpenAI chat completion fine-tuning format */
export interface OpenAIChatLine {
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  }>;
  tools?: Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, any> };
  }>;
}

/** ShareGPT format (LLaMA Factory, older open-source tools) */
export interface ShareGPTLine {
  conversations: Array<{
    from: 'system' | 'human' | 'gpt' | 'tool';
    value: string;
  }>;
}

/** DPO preference pair format */
export interface DPOLine {
  input: {
    messages: Array<{ role: 'system' | 'user'; content: string }>;
  };
  preferred_output: Array<{ role: 'assistant'; content: string }>;
  non_preferred_output: Array<{ role: 'assistant'; content: string }>;
}

/** Metadata sidecar line (one per training example) */
export interface MetadataLine {
  executionId: string;
  scenarioId: string;
  personaId?: string;
  score?: number;
  turnCount: number;
  duration?: number;
  tags?: string[];
  personaTraits?: Record<string, any>;
  scenarioName?: string;
  personaName?: string;
}
