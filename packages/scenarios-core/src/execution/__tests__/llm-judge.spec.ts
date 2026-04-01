import { buildLlmJudge, buildOpenAiJudge } from '../judge-llm';
import type { ResolvedLlmConfig } from '../llm-config-resolver';

// Mock global.fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

afterEach(() => {
  mockFetch.mockReset();
});

function mockOpenAiResponse(parsed: Record<string, any>) {
  return {
    ok: true,
    text: () => Promise.resolve(JSON.stringify({ choices: [{ message: { content: JSON.stringify(parsed) } }] })),
    json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify(parsed) } }] }),
  };
}

function mockAnthropicResponse(parsed: Record<string, any>) {
  return {
    ok: true,
    text: () => Promise.resolve(JSON.stringify({ content: [{ text: JSON.stringify(parsed) }] })),
    json: () => Promise.resolve({ content: [{ text: JSON.stringify(parsed) }] }),
  };
}

describe('buildLlmJudge', () => {
  it('returns undefined when config is undefined', () => {
    const judge = buildLlmJudge(undefined);
    expect(judge).toBeUndefined();
  });

  it('returns a function when config has openai kind', () => {
    const judge = buildLlmJudge({ kind: 'openai', apiKey: 'sk-test' });
    expect(typeof judge).toBe('function');
  });

  it('returns a function when config has anthropic kind', () => {
    const judge = buildLlmJudge({ kind: 'anthropic', apiKey: 'sk-ant-test' });
    expect(typeof judge).toBe('function');
  });

  it('openai judge calls fetch with correct URL and headers', async () => {
    mockFetch.mockResolvedValue(mockOpenAiResponse({
      result: true, passed: true, reasoning: 'OK', evidence: [],
    }));

    const judge = buildLlmJudge({ kind: 'openai', apiKey: 'sk-test-key', model: 'gpt-4o' })!;
    await judge({
      criterionName: 'test',
      description: 'test desc',
      evaluationType: 'boolean',
      transcript: 'Agent: hello',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test-key',
          'Content-Type': 'application/json',
        }),
      }),
    );

    // Verify model is passed
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('gpt-4o');
  });

  it('anthropic judge calls fetch with correct URL, x-api-key header, anthropic-version', async () => {
    mockFetch.mockResolvedValue(mockAnthropicResponse({
      result: 8, passed: true, reasoning: 'Good', evidence: ['quote'],
    }));

    const judge = buildLlmJudge({ kind: 'anthropic', apiKey: 'sk-ant-key', model: 'claude-3-5-haiku-20241022' })!;
    await judge({
      criterionName: 'quality',
      description: 'evaluate quality',
      evaluationType: 'score',
      transcript: 'Agent: hello',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'sk-ant-key',
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        }),
      }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('claude-3-5-haiku-20241022');
  });

  it('parses JSON response and returns {result, passed, reasoning, evidence}', async () => {
    mockFetch.mockResolvedValue(mockOpenAiResponse({
      result: 9,
      passed: true,
      reasoning: 'Agent handled the situation well.',
      evidence: ['Agent apologized', 'Offered refund'],
    }));

    const judge = buildLlmJudge({ kind: 'openai', apiKey: 'sk-test' })!;
    const result = await judge({
      criterionName: 'empathy',
      description: 'Did the agent show empathy?',
      evaluationType: 'score',
      transcript: 'Agent: I am sorry for the inconvenience.',
    });

    expect(result.result).toBe(9);
    expect(result.passed).toBe(true);
    expect(result.reasoning).toBe('Agent handled the situation well.');
    expect(result.evidence).toEqual(['Agent apologized', 'Offered refund']);
  });

  it('handles API error (non-200) with thrown error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('Rate limit exceeded'),
    });

    const judge = buildLlmJudge({ kind: 'openai', apiKey: 'sk-test' })!;

    await expect(
      judge({
        criterionName: 'test',
        description: 'test',
        evaluationType: 'boolean',
        transcript: 'test',
      }),
    ).rejects.toThrow();
  });

  it('handles malformed JSON gracefully with defaults', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'not json' } }] }),
    });

    const judge = buildLlmJudge({ kind: 'openai', apiKey: 'sk-test' })!;
    const result = await judge({
      criterionName: 'test',
      description: 'test',
      evaluationType: 'boolean',
      transcript: 'test',
    });

    // Should return defaults without crashing
    expect(result).toBeDefined();
    expect(typeof result.result).toBeDefined();
    expect(typeof result.reasoning).toBe('string');
  });

  it('uses default model when config.model not provided (openai)', async () => {
    mockFetch.mockResolvedValue(mockOpenAiResponse({
      result: true, passed: true, reasoning: 'OK', evidence: [],
    }));

    const judge = buildLlmJudge({ kind: 'openai', apiKey: 'sk-test' })!;
    await judge({
      criterionName: 'test',
      description: 'test',
      evaluationType: 'boolean',
      transcript: 'test',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('gpt-4o-mini');
  });

  it('uses default model when config.model not provided (anthropic)', async () => {
    mockFetch.mockResolvedValue(mockAnthropicResponse({
      result: true, passed: true, reasoning: 'OK', evidence: [],
    }));

    const judge = buildLlmJudge({ kind: 'anthropic', apiKey: 'sk-ant' })!;
    await judge({
      criterionName: 'test',
      description: 'test',
      evaluationType: 'boolean',
      transcript: 'test',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('claude-3-5-haiku-20241022');
  });
});

describe('buildOpenAiJudge (deprecated alias)', () => {
  it('still works for backwards compatibility', async () => {
    mockFetch.mockResolvedValue(mockOpenAiResponse({
      result: true, passed: true, reasoning: 'OK', evidence: [],
    }));

    const judge = buildOpenAiJudge('sk-test', 'gpt-4o')!;
    expect(typeof judge).toBe('function');

    const result = await judge({
      criterionName: 'test',
      description: 'test',
      evaluationType: 'boolean',
      transcript: 'test',
    });
    expect(result.passed).toBe(true);
  });

  it('returns undefined when apiKey is undefined', () => {
    const judge = buildOpenAiJudge(undefined);
    expect(judge).toBeUndefined();
  });
});
