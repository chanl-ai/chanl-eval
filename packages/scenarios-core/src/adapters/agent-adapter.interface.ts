export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp?: Date;
  /**
   * Provider-specific data that should be passed through as-is when
   * rebuilding the message array for the next API call.
   * For example, OpenAI assistant messages with tool_calls, or
   * Anthropic tool_result content blocks.
   */
  providerData?: Record<string, any>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
}

export interface AgentResponse {
  content: string;
  metadata?: Record<string, any>;
  latencyMs?: number;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
    result?: any;
  }>;
}

export interface AgentAdapterConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  endpoint?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  tools?: ToolDefinition[];
  [key: string]: any;
}

export interface AgentAdapter {
  readonly name: string;
  readonly type: string;

  connect(config: AgentAdapterConfig): Promise<void>;
  sendMessage(
    message: string,
    history: AgentMessage[],
  ): Promise<AgentResponse>;
  disconnect(): Promise<void>;

  /**
   * Format a tool execution result into a provider-specific message
   * that can be appended to the conversation history.
   */
  formatToolResult(toolCallId: string, toolName: string, result: any): AgentMessage;

  /**
   * Build the complete set of history messages needed after a tool call round.
   * Returns: [assistant message with tool_calls, ...tool result messages]
   *
   * Each provider has different requirements:
   * - OpenAI: assistant msg must include raw `tool_calls`, results use `role: tool`
   * - Anthropic: assistant msg includes `tool_use` content blocks, results wrapped in `tool_result`
   * - HTTP: generic format
   *
   * The execution processor pushes all returned messages into history, then
   * calls sendMessage again. This keeps all provider-specific formatting
   * inside the adapter.
   */
  buildToolCallHistory(
    response: AgentResponse,
    resolvedResults: Array<{ id: string; name: string; result: any }>,
  ): AgentMessage[];
}
