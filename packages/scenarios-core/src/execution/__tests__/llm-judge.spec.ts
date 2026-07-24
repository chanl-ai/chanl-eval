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

  it('reports an API error as an explicit error, never as a low score', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limit exceeded'),
    });

    const judge = buildLlmJudge({ kind: 'openai', apiKey: 'sk-test' })!;
    const result = await judge({
      criterionName: 'test',
      description: 'test',
      evaluationType: 'score',
      transcript: 'test',
    });

    // The old behaviour returned result: 5 / passed: false, which is indistinguishable from the
    // judge deciding the agent was mediocre. A transport failure is not evidence about the agent.
    expect(result.error).toBeDefined();
    expect(result.error).toContain('429');
    expect(result.result).toBeNull();
    expect(result.reasoning).toContain('Judge did not return a usable verdict');
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

// ==========================================================================
// Custom host (F2) — persona and judge must not be pinned to the public provider
// ==========================================================================
describe('buildLlmJudge — custom baseUrl', () => {
  const params = {
    criterionName: 'test',
    description: 'test',
    evaluationType: 'boolean' as const,
    transcript: 'test',
  };

  it('routes an OpenAI-compatible base URL to /v1/chat/completions', async () => {
    mockFetch.mockResolvedValue(mockOpenAiResponse({ result: true, passed: true, reasoning: 'ok', evidence: [] }));

    const judge = buildLlmJudge({ kind: 'openai', apiKey: 'x', baseUrl: 'http://localhost:11434' })!;
    await judge(params);

    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('does not double-append when the base already ends in /v1', async () => {
    mockFetch.mockResolvedValue(mockOpenAiResponse({ result: true, passed: true, reasoning: 'ok', evidence: [] }));

    const judge = buildLlmJudge({ kind: 'openai', apiKey: 'x', baseUrl: 'http://localhost:11434/v1/' })!;
    await judge(params);

    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('accepts a full endpoint URL unchanged', async () => {
    mockFetch.mockResolvedValue(mockOpenAiResponse({ result: true, passed: true, reasoning: 'ok', evidence: [] }));

    const judge = buildLlmJudge({
      kind: 'openai',
      apiKey: 'x',
      baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    })!;
    await judge(params);

    expect(mockFetch.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('routes an Anthropic-compatible base URL to /v1/messages', async () => {
    mockFetch.mockResolvedValue(mockAnthropicResponse({ result: true, passed: true, reasoning: 'ok', evidence: [] }));

    const judge = buildLlmJudge({ kind: 'anthropic', apiKey: 'x', baseUrl: 'https://proxy.internal' })!;
    await judge(params);

    expect(mockFetch.mock.calls[0][0]).toBe('https://proxy.internal/v1/messages');
  });

  it('falls back to the public host when no baseUrl is given', async () => {
    mockFetch.mockResolvedValue(mockOpenAiResponse({ result: true, passed: true, reasoning: 'ok', evidence: [] }));

    const judge = buildLlmJudge({ kind: 'openai', apiKey: 'x' })!;
    await judge(params);

    expect(mockFetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
  });
});

// ==========================================================================
// Self-consistency (F3)
// ==========================================================================
describe('buildLlmJudge — self-consistency', () => {
  function queueOpenAi(responses: Record<string, any>[]) {
    for (const r of responses) mockFetch.mockResolvedValueOnce(mockOpenAiResponse(r));
  }

  it('makes exactly one call and reports no confidence by default', async () => {
    queueOpenAi([{ result: true, passed: true, reasoning: 'ok', evidence: [] }]);

    const judge = buildLlmJudge({ kind: 'openai', apiKey: 'x' })!;
    const result = await judge({
      criterionName: 'c', description: 'd', evaluationType: 'boolean', transcript: 't',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.confidence).toBeUndefined();
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).temperature).toBe(0.2);
  });

  it('draws k samples and majority-votes a boolean verdict', async () => {
    queueOpenAi([
      { result: true, passed: true, reasoning: 'yes A', evidence: ['a'] },
      { result: false, passed: false, reasoning: 'no B', evidence: ['b'] },
      { result: true, passed: true, reasoning: 'yes C', evidence: ['c'] },
    ]);

    const judge = buildLlmJudge({ kind: 'openai', apiKey: 'x' })!;
    const result = await judge({
      criterionName: 'c', description: 'd', evaluationType: 'boolean', transcript: 't',
      selfConsistency: 3,
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.result).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.confidence).toBeCloseTo(2 / 3);
    expect(result.reasoning).toContain('2/3 agreed');
  });

  it('reports full confidence when every sample agrees', async () => {
    queueOpenAi([
      { result: false, passed: false, reasoning: 'no', evidence: [] },
      { result: false, passed: false, reasoning: 'no', evidence: [] },
      { result: false, passed: false, reasoning: 'no', evidence: [] },
    ]);

    const judge = buildLlmJudge({ kind: 'openai', apiKey: 'x' })!;
    const result = await judge({
      criterionName: 'c', description: 'd', evaluationType: 'boolean', transcript: 't',
      selfConsistency: 3,
    });

    expect(result.result).toBe(false);
    expect(result.confidence).toBe(1);
  });

  it('takes the median for score criteria and flags disagreement', async () => {
    queueOpenAi([
      { result: 9, passed: true, reasoning: 'great', evidence: [] },
      { result: 3, passed: false, reasoning: 'poor', evidence: [] },
      { result: 8, passed: true, reasoning: 'good', evidence: [] },
    ]);

    const judge = buildLlmJudge({ kind: 'openai', apiKey: 'x' })!;
    const result = await judge({
      criterionName: 'c', description: 'd', evaluationType: 'score', transcript: 't',
      selfConsistency: 3,
    });

    expect(result.result).toBe(8);
    expect(result.passed).toBe(true); // 2 of 3 samples passed
    // 9 and 8 are within ±1 of the median; 3 is not.
    expect(result.confidence).toBeCloseTo(2 / 3);
  });

  it('samples at a higher temperature so agreement is meaningful', async () => {
    queueOpenAi([
      { result: true, passed: true, reasoning: 'a', evidence: [] },
      { result: true, passed: true, reasoning: 'b', evidence: [] },
    ]);

    const judge = buildLlmJudge({ kind: 'openai', apiKey: 'x' })!;
    await judge({
      criterionName: 'c', description: 'd', evaluationType: 'boolean', transcript: 't',
      selfConsistency: 2,
    });

    expect(JSON.parse(mockFetch.mock.calls[0][1].body).temperature).toBe(0.7);
  });

  it('aggregates the surviving samples when some fail', async () => {
    mockFetch
      .mockResolvedValueOnce(mockOpenAiResponse({ result: true, passed: true, reasoning: 'ok', evidence: [] }))
      // second sample fails both its attempt and its retry
      .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('boom') })
      .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('boom') })
      .mockResolvedValueOnce(mockOpenAiResponse({ result: true, passed: true, reasoning: 'ok', evidence: [] }));

    const judge = buildLlmJudge({ kind: 'openai', apiKey: 'x' })!;
    const result = await judge({
      criterionName: 'c', description: 'd', evaluationType: 'boolean', transcript: 't',
      selfConsistency: 3,
    });

    expect(result.error).toBeUndefined();
    expect(result.result).toBe(true);
    expect(result.reasoning).toContain('1 of 3 samples failed');
  });

  it('clamps selfConsistency to a sane range', async () => {
    mockFetch.mockResolvedValue(mockOpenAiResponse({ result: true, passed: true, reasoning: 'ok', evidence: [] }));

    const judge = buildLlmJudge({ kind: 'openai', apiKey: 'x' })!;
    await judge({
      criterionName: 'c', description: 'd', evaluationType: 'boolean', transcript: 't',
      selfConsistency: 500,
    });

    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(9);
  });

  it('retries once before giving up on unparseable output', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: 'not json' } }] }) })
      .mockResolvedValueOnce(mockOpenAiResponse({ result: true, passed: true, reasoning: 'recovered', evidence: [] }));

    const judge = buildLlmJudge({ kind: 'openai', apiKey: 'x' })!;
    const result = await judge({
      criterionName: 'c', description: 'd', evaluationType: 'boolean', transcript: 't',
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.error).toBeUndefined();
    expect(result.reasoning).toBe('recovered');
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
