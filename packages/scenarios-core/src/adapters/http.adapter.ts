import {
  AgentAdapter,
  AgentAdapterConfig,
  AgentMessage,
  AgentResponse,
} from './agent-adapter.interface';

export class HttpAdapter implements AgentAdapter {
  readonly name = 'HTTP';
  readonly type = 'http';

  private config: AgentAdapterConfig = {};
  private connected = false;

  async connect(config: AgentAdapterConfig): Promise<void> {
    if (!config.endpoint) {
      throw new Error('HTTP adapter requires endpoint URL');
    }
    this.config = { ...config };
    this.connected = true;
  }

  async sendMessage(
    message: string,
    history: AgentMessage[],
  ): Promise<AgentResponse> {
    if (!this.connected) {
      throw new Error('HTTP adapter not connected. Call connect() first.');
    }

    const start = Date.now();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const requestBody: Record<string, any> = {
      message,
      history,
      systemPrompt: this.config.systemPrompt,
      model: this.config.model,
      temperature: this.config.temperature,
    };

    if (this.config.tools?.length) {
      requestBody.tools = this.config.tools;
    }

    const response = await fetch(this.config.endpoint!, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP endpoint error (${response.status}): ${error}`);
    }

    const data: any = await response.json();
    const latencyMs = Date.now() - start;

    // Support multiple response formats
    const content =
      typeof data === 'string'
        ? data
        : data.content || data.message || data.response || data.text || '';

    // Normalize tool calls to include an id field
    const rawToolCalls = data.toolCalls || data.tool_calls;
    const toolCalls = rawToolCalls?.map((tc: any, idx: number) => ({
      id: tc.id || `http_call_${idx}`,
      name: tc.name,
      arguments: tc.arguments || {},
      ...(tc.result !== undefined ? { result: tc.result } : {}),
    }));

    return {
      content,
      latencyMs,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      metadata: data.metadata || {},
    };
  }

  formatToolResult(toolCallId: string, toolName: string, result: any): AgentMessage {
    return {
      role: 'user',
      content: typeof result === 'string' ? result : JSON.stringify(result),
      providerData: {
        toolCallId,
        toolName,
        isToolResult: true,
      },
    };
  }

  buildToolCallHistory(
    response: AgentResponse,
    resolvedResults: Array<{ id: string; name: string; result: any }>,
  ): AgentMessage[] {
    const messages: AgentMessage[] = [];
    messages.push({ role: 'assistant', content: response.content || '' });
    for (const r of resolvedResults) {
      messages.push(this.formatToolResult(r.id, r.name, r.result));
    }
    return messages;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.config = {};
  }
}
