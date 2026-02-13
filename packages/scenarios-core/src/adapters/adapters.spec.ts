import { AdapterRegistry } from './adapter-registry';
import { OpenAIAdapter } from './openai.adapter';
import { AnthropicAdapter } from './anthropic.adapter';
import { HttpAdapter } from './http.adapter';
import { AgentAdapter, AgentAdapterConfig } from './agent-adapter.interface';

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  it('should register and retrieve adapters', () => {
    const adapter = new OpenAIAdapter();
    registry.register(adapter);

    expect(registry.has('openai')).toBe(true);
    expect(registry.get('openai')).toBe(adapter);
  });

  it('should list all registered adapters', () => {
    registry.register(new OpenAIAdapter());
    registry.register(new AnthropicAdapter());
    registry.register(new HttpAdapter());

    expect(registry.listTypes()).toEqual(['openai', 'anthropic', 'http']);
    expect(registry.list()).toHaveLength(3);
  });

  it('should return undefined for unregistered type', () => {
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('should throw on getOrThrow for unregistered type', () => {
    expect(() => registry.getOrThrow('unknown')).toThrow(
      /No adapter registered for type "unknown"/,
    );
  });
});

describe('OpenAIAdapter', () => {
  let adapter: OpenAIAdapter;

  beforeEach(() => {
    adapter = new OpenAIAdapter();
  });

  it('should have correct name and type', () => {
    expect(adapter.name).toBe('OpenAI');
    expect(adapter.type).toBe('openai');
  });

  it('should throw if apiKey not provided on connect', async () => {
    await expect(adapter.connect({})).rejects.toThrow('requires apiKey');
  });

  it('should connect with valid config', async () => {
    await adapter.connect({ apiKey: 'test-key' });
    // Should not throw
  });

  it('should throw if sendMessage called before connect', async () => {
    await expect(adapter.sendMessage('hello', [])).rejects.toThrow(
      'not connected',
    );
  });

  it('should send message to OpenAI API', async () => {
    const mockResponse = {
      choices: [
        {
          message: { content: 'Hello! How can I help?' },
          finish_reason: 'stop',
        },
      ],
      model: 'gpt-4o',
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    await adapter.connect({ apiKey: 'test-key', model: 'gpt-4o' });
    const response = await adapter.sendMessage('Hello', []);

    expect(response.content).toBe('Hello! How can I help?');
    expect(response.latencyMs).toBeDefined();
    expect(response.metadata?.model).toBe('gpt-4o');

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.model).toBe('gpt-4o');
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('should include system prompt and history', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'response' } }],
        }),
    });

    await adapter.connect({
      apiKey: 'test-key',
      systemPrompt: 'You are helpful.',
    });

    await adapter.sendMessage('Question', [
      { role: 'user', content: 'Previous question' },
      { role: 'assistant', content: 'Previous answer' },
    ]);

    const body = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body,
    );
    expect(body.messages).toHaveLength(4); // system + 2 history + user
    expect(body.messages[0].role).toBe('system');
  });

  it('should handle API errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limited'),
    });

    await adapter.connect({ apiKey: 'test-key' });
    await expect(adapter.sendMessage('Hello', [])).rejects.toThrow(
      'OpenAI API error (429)',
    );
  });

  it('should disconnect cleanly', async () => {
    await adapter.connect({ apiKey: 'test-key' });
    await adapter.disconnect();
    await expect(adapter.sendMessage('Hello', [])).rejects.toThrow(
      'not connected',
    );
  });
});

describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter;

  beforeEach(() => {
    adapter = new AnthropicAdapter();
  });

  it('should have correct name and type', () => {
    expect(adapter.name).toBe('Anthropic');
    expect(adapter.type).toBe('anthropic');
  });

  it('should throw if apiKey not provided on connect', async () => {
    await expect(adapter.connect({})).rejects.toThrow('requires apiKey');
  });

  it('should send message to Anthropic API', async () => {
    const mockResponse = {
      content: [{ type: 'text', text: 'Hello from Claude!' }],
      model: 'claude-sonnet-4-5-20250929',
      usage: { input_tokens: 10, output_tokens: 5 },
      stop_reason: 'end_turn',
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    await adapter.connect({ apiKey: 'test-key' });
    const response = await adapter.sendMessage('Hello', []);

    expect(response.content).toBe('Hello from Claude!');
    expect(response.latencyMs).toBeDefined();

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[1].headers['x-api-key']).toBe('test-key');
    expect(fetchCall[1].headers['anthropic-version']).toBe('2023-06-01');
  });
});

describe('HttpAdapter', () => {
  let adapter: HttpAdapter;

  beforeEach(() => {
    adapter = new HttpAdapter();
  });

  it('should have correct name and type', () => {
    expect(adapter.name).toBe('HTTP');
    expect(adapter.type).toBe('http');
  });

  it('should throw if endpoint not provided on connect', async () => {
    await expect(adapter.connect({})).rejects.toThrow('requires endpoint');
  });

  it('should POST to arbitrary endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ content: 'Agent response', metadata: {} }),
    });

    await adapter.connect({
      endpoint: 'https://my-agent.example.com/chat',
      apiKey: 'my-key',
    });

    const response = await adapter.sendMessage('Hello', []);

    expect(response.content).toBe('Agent response');

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[0]).toBe('https://my-agent.example.com/chat');
    expect(fetchCall[1].headers['Authorization']).toBe('Bearer my-key');
  });

  it('should handle string response format', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve('Plain text response'),
    });

    await adapter.connect({ endpoint: 'https://example.com/chat' });
    const response = await adapter.sendMessage('Hello', []);
    expect(response.content).toBe('Plain text response');
  });

  it('should handle API errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    await adapter.connect({ endpoint: 'https://example.com/chat' });
    await expect(adapter.sendMessage('Hello', [])).rejects.toThrow(
      'HTTP endpoint error (500)',
    );
  });
});
