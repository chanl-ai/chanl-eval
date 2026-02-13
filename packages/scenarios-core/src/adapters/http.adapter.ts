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

    const response = await fetch(this.config.endpoint!, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message,
        history,
        systemPrompt: this.config.systemPrompt,
        model: this.config.model,
        temperature: this.config.temperature,
      }),
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

    return {
      content,
      latencyMs,
      toolCalls: data.toolCalls || data.tool_calls,
      metadata: data.metadata || {},
    };
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.config = {};
  }
}
