# Agent Adapter System

Agent adapters connect chanl-eval to the AI agents you want to test. Each adapter translates the generic `AgentAdapter` interface into provider-specific API calls.

## AgentAdapter Interface

Every adapter implements three methods:

```typescript
// packages/scenarios-core/src/adapters/agent-adapter.interface.ts

interface AgentAdapter {
  readonly name: string;   // human-readable name (e.g., "OpenAI")
  readonly type: string;   // lookup key (e.g., "openai")

  connect(config: AgentAdapterConfig): Promise<void>;
  sendMessage(message: string, history: AgentMessage[]): Promise<AgentResponse>;
  disconnect(): Promise<void>;
}
```

**connect()** -- Initialize the adapter with configuration (API keys, model, endpoint, etc.). Validate required fields and store state.

**sendMessage()** -- Send a user message along with conversation history. Return the agent's response with content, latency, optional tool calls, and metadata.

**disconnect()** -- Clean up resources and reset state.

### Supporting Types

```typescript
interface AgentAdapterConfig {
  model?: string;              // e.g., "gpt-4o", "claude-sonnet-4-5-20250929"
  temperature?: number;        // 0.0-2.0
  maxTokens?: number;          // max response tokens
  systemPrompt?: string;       // system-level instructions
  endpoint?: string;           // API endpoint URL
  apiKey?: string;             // authentication key
  headers?: Record<string, string>;  // extra HTTP headers
  [key: string]: any;          // adapter-specific options
}

interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
}

interface AgentResponse {
  content: string;                     // agent's text response
  metadata?: Record<string, any>;      // provider-specific metadata (model, usage, etc.)
  latencyMs?: number;                  // round-trip time in milliseconds
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, any>;
    result?: any;
  }>;
}
```

## Built-in Adapters

### OpenAI Adapter

Tests agents built on OpenAI's Chat Completions API (GPT-4o, GPT-4, etc.).

```typescript
import { OpenAIAdapter } from '@chanl/scenarios-core';

const adapter = new OpenAIAdapter();
await adapter.connect({
  apiKey: 'sk-...',
  model: 'gpt-4o',          // default: gpt-4o
  temperature: 0.7,         // default: 0.7
  maxTokens: 1024,          // default: 1024
  systemPrompt: 'You are a customer service agent.',
});

const response = await adapter.sendMessage('I need help with my bill.', []);
// response.content = "I'd be happy to help with your billing issue..."
// response.metadata.model = "gpt-4o"
// response.metadata.usage = { prompt_tokens: 42, completion_tokens: 28 }
// response.latencyMs = 1200
```

Endpoint defaults to `https://api.openai.com/v1/chat/completions`. Override with `endpoint` for Azure OpenAI or compatible APIs.

Source: `packages/scenarios-core/src/adapters/openai.adapter.ts`

### Anthropic Adapter

Tests agents built on Anthropic's Messages API (Claude models).

```typescript
import { AnthropicAdapter } from '@chanl/scenarios-core';

const adapter = new AnthropicAdapter();
await adapter.connect({
  apiKey: 'sk-ant-...',
  model: 'claude-sonnet-4-5-20250929',  // default
  temperature: 0.7,
  maxTokens: 1024,
  systemPrompt: 'You are a customer service agent.',
});

const response = await adapter.sendMessage('I need help with my bill.', []);
```

The adapter handles Anthropic-specific details: system prompt goes in the `system` field (not as a message), `x-api-key` header instead of `Authorization`, and content blocks are concatenated into a single string.

Source: `packages/scenarios-core/src/adapters/anthropic.adapter.ts`

### HTTP Adapter

Tests any AI agent exposed as a REST endpoint. This is the most flexible adapter -- use it for custom agents, internal services, or platforms without a dedicated adapter.

```typescript
import { HttpAdapter } from '@chanl/scenarios-core';

const adapter = new HttpAdapter();
await adapter.connect({
  endpoint: 'https://my-agent.example.com/chat',  // required
  apiKey: 'my-api-key',                            // optional, sent as Bearer token
  headers: { 'X-Custom-Header': 'value' },         // optional extra headers
});

const response = await adapter.sendMessage('Hello', [
  { role: 'user', content: 'Previous question' },
  { role: 'assistant', content: 'Previous answer' },
]);
```

The adapter POSTs a JSON body with `message`, `history`, `systemPrompt`, `model`, and `temperature`. It accepts multiple response formats:

```json
// Any of these work:
{ "content": "Agent response" }
{ "message": "Agent response" }
{ "response": "Agent response" }
{ "text": "Agent response" }
"Plain text response"
```

Source: `packages/scenarios-core/src/adapters/http.adapter.ts`

## AdapterRegistry

Adapters are registered at startup and retrieved by type string during execution:

```typescript
import { AdapterRegistry, OpenAIAdapter, AnthropicAdapter, HttpAdapter } from '@chanl/scenarios-core';

const registry = new AdapterRegistry();
registry.register(new OpenAIAdapter());      // type: "openai"
registry.register(new AnthropicAdapter());   // type: "anthropic"
registry.register(new HttpAdapter());        // type: "http"

// Look up by type
const adapter = registry.getOrThrow('openai');

// List available adapters
registry.listTypes();  // ['openai', 'anthropic', 'http']
registry.list();       // [OpenAIAdapter, AnthropicAdapter, HttpAdapter]
registry.has('openai'); // true
```

Source: `packages/scenarios-core/src/adapters/adapter-registry.ts`

## Building a Custom Adapter

Follow these steps to create an adapter for a new AI agent platform.

### Step 1: Implement the AgentAdapter Interface

Create a new file in `adapters/` (community) or `packages/scenarios-core/src/adapters/` (core):

```typescript
// adapters/my-platform/my-platform.adapter.ts

import {
  AgentAdapter,
  AgentAdapterConfig,
  AgentMessage,
  AgentResponse,
} from '@chanl/scenarios-core';

export class MyPlatformAdapter implements AgentAdapter {
  readonly name = 'MyPlatform';
  readonly type = 'my-platform';   // unique identifier for registry lookup

  private config: AgentAdapterConfig = {};
  private connected = false;

  async connect(config: AgentAdapterConfig): Promise<void> {
    // Validate required configuration
    if (!config.apiKey) {
      throw new Error('MyPlatform adapter requires apiKey');
    }
    if (!config.endpoint) {
      throw new Error('MyPlatform adapter requires endpoint');
    }

    this.config = {
      // Set defaults, then apply user config
      model: 'my-platform-default',
      temperature: 0.7,
      maxTokens: 1024,
      ...config,
    };
    this.connected = true;
  }

  async sendMessage(
    message: string,
    history: AgentMessage[],
  ): Promise<AgentResponse> {
    if (!this.connected) {
      throw new Error('MyPlatform adapter not connected. Call connect() first.');
    }

    const start = Date.now();

    // Build the request for your platform's API
    const response = await fetch(this.config.endpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
      },
      body: JSON.stringify({
        // Map to your platform's request format
        input: message,
        conversation: history.map(m => ({
          role: m.role,
          text: m.content,
        })),
        model: this.config.model,
        options: {
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`MyPlatform API error (${response.status}): ${error}`);
    }

    const data: any = await response.json();
    const latencyMs = Date.now() - start;

    return {
      content: data.output || data.text || '',
      latencyMs,
      toolCalls: data.tools?.map((t: any) => ({
        name: t.name,
        arguments: t.params || {},
      })),
      metadata: {
        model: data.model,
        usage: data.usage,
      },
    };
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.config = {};
  }
}
```

### Step 2: Register the Adapter

```typescript
import { AdapterRegistry } from '@chanl/scenarios-core';
import { MyPlatformAdapter } from './my-platform.adapter';

const registry = new AdapterRegistry();
registry.register(new MyPlatformAdapter());

// Now scenarios can reference type: "my-platform"
```

### Step 3: Write Tests

Follow the pattern in `packages/scenarios-core/src/adapters/adapters.spec.ts`:

```typescript
describe('MyPlatformAdapter', () => {
  let adapter: MyPlatformAdapter;

  beforeEach(() => {
    adapter = new MyPlatformAdapter();
  });

  it('should have correct name and type', () => {
    expect(adapter.name).toBe('MyPlatform');
    expect(adapter.type).toBe('my-platform');
  });

  it('should throw if required config is missing', async () => {
    await expect(adapter.connect({})).rejects.toThrow('requires apiKey');
  });

  it('should throw if sendMessage called before connect', async () => {
    await expect(adapter.sendMessage('hello', [])).rejects.toThrow('not connected');
  });

  it('should send message and return response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ output: 'Hello from MyPlatform!' }),
    });

    await adapter.connect({ apiKey: 'test-key', endpoint: 'https://example.com/api' });
    const response = await adapter.sendMessage('Hello', []);

    expect(response.content).toBe('Hello from MyPlatform!');
    expect(response.latencyMs).toBeDefined();
  });

  it('should disconnect cleanly', async () => {
    await adapter.connect({ apiKey: 'test-key', endpoint: 'https://example.com/api' });
    await adapter.disconnect();
    await expect(adapter.sendMessage('Hello', [])).rejects.toThrow('not connected');
  });
});
```

### Step 4: Use in a Scenario

Once registered, reference the adapter type in your scenario's agent configuration:

```yaml
agent:
  type: my-platform
  config:
    apiKey: ${MY_PLATFORM_API_KEY}
    endpoint: https://api.myplatform.com/v1/chat
    model: my-platform-pro
    systemPrompt: "You are a helpful customer support agent."
```

## Configuration Options

All adapters share the base `AgentAdapterConfig` fields. Adapter-specific options are passed through the `[key: string]: any` index signature.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `apiKey` | string | Varies | API authentication key |
| `endpoint` | string | Varies | API endpoint URL |
| `model` | string | No | Model identifier |
| `temperature` | number | No | Response randomness (0.0-2.0) |
| `maxTokens` | number | No | Maximum response tokens |
| `systemPrompt` | string | No | System-level instructions |
| `headers` | Record | No | Additional HTTP headers |

**Required fields by adapter:**
- **OpenAI**: `apiKey`
- **Anthropic**: `apiKey`
- **HTTP**: `endpoint`
