/**
 * E2E Test Helpers
 *
 * Shared utilities for end-to-end tests that exercise the full
 * conversation loop without mocking the core pipeline.
 */

import * as http from 'http';

// ─── Mock HTTP Agent Server ───────────────────────────────────────────
// Starts a real HTTP server that simulates an AI agent.
// The HTTP adapter connects to this server, sends persona messages,
// and receives agent responses — testing the full pipeline.

export interface MockAgentResponse {
  content: string;
  tool_calls?: Array<{ id: string; name: string; arguments: Record<string, any> }>;
}

export interface MockAgentServer {
  url: string;
  port: number;
  server: http.Server;
  receivedMessages: Array<{ message: string; history: any[] }>;
  close: () => Promise<void>;
}

/**
 * Start a mock HTTP agent that returns sequential responses.
 * If responses run out, returns a "goodbye" message to end the conversation.
 */
export function startMockAgent(
  responses: MockAgentResponse[],
  port = 0, // 0 = random available port
): Promise<MockAgentServer> {
  return new Promise((resolve) => {
    let callIndex = 0;
    const receivedMessages: Array<{ message: string; history: any[] }> = [];

    const server = http.createServer(async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end('Method not allowed');
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());

      receivedMessages.push({
        message: body.message,
        history: body.history || [],
      });

      const response =
        callIndex < responses.length
          ? responses[callIndex]
          : { content: 'Thank you for calling. Goodbye!' };
      callIndex++;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    });

    server.listen(port, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        port: addr.port,
        server,
        receivedMessages,
        close: () =>
          new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

// ─── Canned Message Detection ─────────────────────────────────────────

const CANNED_MESSAGES = [
  'can you tell me more about that?',
  'i see. can you help me with that?',
];

/**
 * Check if a message is one of the hardcoded fallback responses
 * from the execution processor's generateNextPersonaMessage().
 */
export function isCannedMessage(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return CANNED_MESSAGES.some((c) => lower === c);
}

// ─── Default Test Data Factories ──────────────────────────────────────

export function makePersonaData(overrides: Record<string, any> = {}) {
  return {
    name: 'Test Customer',
    gender: 'female',
    emotion: 'frustrated',
    language: 'english',
    accent: 'american',
    intentClarity: 'very clear',
    speechStyle: 'normal',
    backgroundNoise: false,
    allowInterruptions: false,
    description: 'A frustrated customer with a broken laptop',
    backstory: 'You bought a laptop 2 weeks ago and it keeps crashing.',
    behavior: {
      personality: 'assertive',
      cooperationLevel: 'difficult',
      patience: 'impatient',
      communicationStyle: 'direct',
    },
    variables: {},
    tags: ['e2e-test'],
    isActive: true,
    isDefault: false,
    createdBy: 'e2e-test',
    ...overrides,
  };
}

export function makeScenarioData(
  personaIds: string[],
  overrides: Record<string, any> = {},
) {
  return {
    name: 'E2E Test Scenario',
    prompt:
      'I bought a laptop two weeks ago and it keeps crashing. I want a full refund.',
    category: 'support',
    difficulty: 'medium',
    status: 'active',
    personaIds,
    tags: ['e2e-test'],
    createdBy: 'e2e-test',
    ...overrides,
  };
}

export function makePromptData(
  endpoint: string,
  overrides: Record<string, any> = {},
) {
  return {
    name: 'E2E Test Agent',
    content: 'You are a helpful customer service agent. Help resolve issues politely.',
    status: 'active',
    tags: ['e2e-test'],
    adapterConfig: {
      adapterType: 'http',
      endpoint,
      model: 'mock',
      temperature: 0.7,
      maxTokens: 512,
      ...overrides.adapterConfig,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
