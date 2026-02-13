import {
  AgentAdapter,
  AgentAdapterConfig,
  AgentMessage,
  AgentResponse,
} from './agent-adapter.interface';

export class AnthropicAdapter implements AgentAdapter {
  readonly name = 'Anthropic';
  readonly type = 'anthropic';

  private config: AgentAdapterConfig = {};
  private connected = false;

  async connect(config: AgentAdapterConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error('Anthropic adapter requires apiKey');
    }
    this.config = {
      model: 'claude-sonnet-4-5-20250929',
      temperature: 0.7,
      maxTokens: 1024,
      endpoint: 'https://api.anthropic.com/v1/messages',
      ...config,
    };
    this.connected = true;
  }

  async sendMessage(
    message: string,
    history: AgentMessage[],
  ): Promise<AgentResponse> {
    if (!this.connected) {
      throw new Error('Anthropic adapter not connected. Call connect() first.');
    }

    const messages: Array<{ role: string; content: string }> = [];

    for (const msg of history) {
      if (msg.role !== 'system') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: message });

    const start = Date.now();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey!,
      'anthropic-version': '2023-06-01',
      ...this.config.headers,
    };

    const body: Record<string, any> = {
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    };

    if (this.config.systemPrompt) {
      body.system = this.config.systemPrompt;
    }

    const response = await fetch(this.config.endpoint!, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${error}`);
    }

    const data: any = await response.json();
    const latencyMs = Date.now() - start;

    const content =
      data.content
        ?.filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('') || '';

    const toolCalls = data.content
      ?.filter((c: any) => c.type === 'tool_use')
      .map((c: any) => ({
        name: c.name,
        arguments: c.input || {},
      }));

    return {
      content,
      latencyMs,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      metadata: {
        model: data.model,
        usage: data.usage,
        stopReason: data.stop_reason,
      },
    };
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.config = {};
  }
}
