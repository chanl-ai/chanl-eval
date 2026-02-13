export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
}

export interface AgentResponse {
  content: string;
  metadata?: Record<string, any>;
  latencyMs?: number;
  toolCalls?: Array<{
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
}
