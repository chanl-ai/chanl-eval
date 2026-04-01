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

    const messages: Array<Record<string, any>> = [];

    for (const msg of history) {
      if (msg.role === 'system') continue;
      if (msg.providerData) {
        // Pass through provider-specific message structure (e.g. assistant
        // messages with content blocks, or user messages with tool_result blocks)
        messages.push({ role: msg.role, content: msg.content, ...msg.providerData });
      } else {
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

    if (this.config.tools?.length) {
      body.tools = this.config.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
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

    const rawToolUseBlocks = data.content?.filter((c: any) => c.type === 'tool_use');
    const toolCalls = rawToolUseBlocks?.map((c: any) => ({
      id: c.id,
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
        // Preserve raw content blocks so the caller can rebuild history
        // with providerData for multi-turn tool use
        ...(rawToolUseBlocks?.length ? { rawContentBlocks: data.content } : {}),
      },
    };
  }

  formatToolResult(toolCallId: string, _toolName: string, result: any): AgentMessage {
    const resultContent = typeof result === 'string' ? result : JSON.stringify(result);
    return {
      role: 'user',
      content: resultContent,
      providerData: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolCallId,
            content: resultContent,
          },
        ],
      },
    };
  }

  buildToolCallHistory(
    response: AgentResponse,
    resolvedResults: Array<{ id: string; name: string; result: any }>,
  ): AgentMessage[] {
    const messages: AgentMessage[] = [];

    // 1. Assistant message with raw content blocks from Anthropic's response
    messages.push({
      role: 'assistant',
      content: response.content || '',
      providerData: response.metadata?.rawContentBlocks
        ? { content: response.metadata.rawContentBlocks }
        : undefined,
    });

    // 2. Anthropic expects all tool results in a single user message
    const toolResults = resolvedResults.map((r) => ({
      type: 'tool_result',
      tool_use_id: r.id,
      content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result),
    }));
    messages.push({
      role: 'user',
      content: '',
      providerData: { content: toolResults },
    });

    return messages;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.config = {};
  }
}
