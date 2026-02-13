import {
  AgentAdapter,
  AgentAdapterConfig,
  AgentMessage,
  AgentResponse,
} from './agent-adapter.interface';

export class OpenAIAdapter implements AgentAdapter {
  readonly name = 'OpenAI';
  readonly type = 'openai';

  private config: AgentAdapterConfig = {};
  private connected = false;

  async connect(config: AgentAdapterConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error('OpenAI adapter requires apiKey');
    }
    this.config = {
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 1024,
      endpoint: 'https://api.openai.com/v1/chat/completions',
      ...config,
    };
    this.connected = true;
  }

  async sendMessage(
    message: string,
    history: AgentMessage[],
  ): Promise<AgentResponse> {
    if (!this.connected) {
      throw new Error('OpenAI adapter not connected. Call connect() first.');
    }

    const messages: Array<{ role: string; content: string }> = [];

    if (this.config.systemPrompt) {
      messages.push({ role: 'system', content: this.config.systemPrompt });
    }

    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }

    messages.push({ role: 'user', content: message });

    const start = Date.now();

    const response = await fetch(this.config.endpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${error}`);
    }

    const data: any = await response.json();
    const latencyMs = Date.now() - start;

    const choice = data.choices?.[0];
    const toolCalls = choice?.message?.tool_calls?.map((tc: any) => ({
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || '{}'),
    }));

    return {
      content: choice?.message?.content || '',
      latencyMs,
      toolCalls,
      metadata: {
        model: data.model,
        usage: data.usage,
        finishReason: choice?.finish_reason,
      },
    };
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.config = {};
  }
}
