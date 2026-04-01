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

    const messages: Array<Record<string, any>> = [];

    if (this.config.systemPrompt) {
      messages.push({ role: 'system', content: this.config.systemPrompt });
    }

    for (const msg of history) {
      if (msg.providerData) {
        // Pass through provider-specific message structure (e.g. assistant
        // messages with tool_calls, or tool-role result messages)
        messages.push({ role: msg.role, content: msg.content, ...msg.providerData });
      } else {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: message });

    const start = Date.now();

    const requestBody: Record<string, any> = {
      model: this.config.model,
      messages,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    };

    if (this.config.tools?.length) {
      requestBody.tools = this.config.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const response = await fetch(this.config.endpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${error}`);
    }

    const data: any = await response.json();
    const latencyMs = Date.now() - start;

    const choice = data.choices?.[0];
    const rawToolCalls = choice?.message?.tool_calls;
    const toolCalls = rawToolCalls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || '{}'),
    }));

    return {
      content: choice?.message?.content || '',
      latencyMs,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      metadata: {
        model: data.model,
        usage: data.usage,
        finishReason: choice?.finish_reason,
        // Preserve raw tool_calls so the caller can rebuild history
        // with providerData for multi-turn tool use
        ...(rawToolCalls ? { rawToolCalls } : {}),
      },
    };
  }

  formatToolResult(toolCallId: string, _toolName: string, result: any): AgentMessage {
    return {
      role: 'user' as any,
      content: typeof result === 'string' ? result : JSON.stringify(result),
      providerData: {
        role: 'tool',
        tool_call_id: toolCallId,
      },
    };
  }

  buildToolCallHistory(
    response: AgentResponse,
    resolvedResults: Array<{ id: string; name: string; result: any }>,
  ): AgentMessage[] {
    const messages: AgentMessage[] = [];

    // 1. Assistant message with raw tool_calls from OpenAI's response
    messages.push({
      role: 'assistant',
      content: response.content || '',
      providerData: response.metadata?.rawToolCalls
        ? { tool_calls: response.metadata.rawToolCalls }
        : undefined,
    });

    // 2. One tool-role message per result
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
