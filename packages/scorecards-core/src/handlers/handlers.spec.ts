import { CriteriaHandlerRegistry } from './criteria-handler-registry';
import { KeywordHandler } from './keyword.handler';
import { PromptHandler } from './prompt.handler';
import { ResponseTimeHandler } from './response-time.handler';
import { ToolCallHandler } from './tool-call.handler';
import { checkThreshold, normalizeScore } from './scoring-utils';
import { EvaluationContext } from './criteria-handler.interface';
import { ScorecardCriteria, CriteriaType } from '../schemas';

// Helper: create a minimal criteria object
function makeCriteria(
  overrides: Partial<ScorecardCriteria> & { type: string; settings: any },
): ScorecardCriteria {
  const base: any = {
    key: 'test_key',
    name: 'Test Criterion',
    version: 1,
    isActive: true,
  };
  return { ...base, ...overrides } as ScorecardCriteria;
}

// Shared evaluation context for most tests
function makeContext(overrides?: Partial<EvaluationContext>): EvaluationContext {
  return {
    transcriptText:
      'Agent: Hello, how can I help you today?\nCustomer: I want a refund for my broken laptop.\nAgent: I understand your frustration. Let me look into that for you.\nCustomer: Thank you.\nAgent: I have processed your refund. Is there anything else I can help you with?\nCustomer: No, thank you. Goodbye.',
    segments: [
      { speaker: 'agent', text: 'Hello, how can I help you today?', startTime: 0, endTime: 3, duration: 3 },
      { speaker: 'customer', text: 'I want a refund for my broken laptop.', startTime: 4, endTime: 8, duration: 4 },
      { speaker: 'agent', text: 'I understand your frustration. Let me look into that for you.', startTime: 9, endTime: 14, duration: 5 },
      { speaker: 'customer', text: 'Thank you.', startTime: 15, endTime: 16, duration: 1 },
      { speaker: 'agent', text: 'I have processed your refund. Is there anything else I can help you with?', startTime: 17, endTime: 23, duration: 6 },
      { speaker: 'customer', text: 'No, thank you. Goodbye.', startTime: 24, endTime: 26, duration: 2 },
    ],
    metrics: {
      duration: 26,
      firstResponseLatency: 1.5,
    },
    toolCalls: [],
    ...overrides,
  };
}

// ==========================================================================
// CriteriaHandlerRegistry
// ==========================================================================
describe('CriteriaHandlerRegistry', () => {
  let registry: CriteriaHandlerRegistry;

  beforeEach(() => {
    registry = new CriteriaHandlerRegistry();
  });

  it('should register and retrieve a handler', () => {
    const handler = new KeywordHandler();
    registry.register(handler);
    expect(registry.get('keyword')).toBe(handler);
  });

  it('should list registered types', () => {
    registry.register(new KeywordHandler());
    registry.register(new PromptHandler());
    expect(registry.listTypes()).toEqual(
      expect.arrayContaining(['keyword', 'prompt']),
    );
  });

  it('should throw on getOrThrow for unregistered type', () => {
    expect(() => registry.getOrThrow('unknown')).toThrow(
      /No criteria handler registered/,
    );
  });

  it('should report has() correctly', () => {
    registry.register(new KeywordHandler());
    expect(registry.has('keyword')).toBe(true);
    expect(registry.has('prompt')).toBe(false);
  });
});

// ==========================================================================
// KeywordHandler
// ==========================================================================
describe('KeywordHandler', () => {
  const handler = new KeywordHandler();

  it('should pass when must_contain keyword is found', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.KEYWORD,
      settings: { matchType: 'must_contain', keyword: 'refund' },
    });
    const result = await handler.evaluate(criteria, makeContext());
    expect(result.result).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.reasoning).toContain('Keywords found');
  });

  it('should fail when must_contain keyword is NOT found', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.KEYWORD,
      settings: { matchType: 'must_contain', keyword: 'discount' },
    });
    const result = await handler.evaluate(criteria, makeContext());
    expect(result.result).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('should pass when must_not_contain keyword is absent', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.KEYWORD,
      settings: { matchType: 'must_not_contain', keyword: ['damn', 'crap'] },
    });
    const result = await handler.evaluate(criteria, makeContext());
    expect(result.result).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('should fail when must_not_contain keyword IS found', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.KEYWORD,
      settings: { matchType: 'must_not_contain', keyword: 'refund' },
    });
    const result = await handler.evaluate(criteria, makeContext());
    expect(result.result).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('Prohibited');
  });

  it('should handle case-insensitive matching by default', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.KEYWORD,
      settings: { matchType: 'must_contain', keyword: 'REFUND' },
    });
    const result = await handler.evaluate(criteria, makeContext());
    expect(result.passed).toBe(true);
  });

  it('should handle case-sensitive matching', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.KEYWORD,
      settings: {
        matchType: 'must_contain',
        keyword: 'REFUND',
        caseSensitive: true,
      },
    });
    const result = await handler.evaluate(criteria, makeContext());
    expect(result.passed).toBe(false);
  });

  it('should extract evidence from segments', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.KEYWORD,
      settings: { matchType: 'must_contain', keyword: 'refund' },
    });
    const result = await handler.evaluate(criteria, makeContext());
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence[0]).toContain('refund');
  });

  it('should match any keyword in array', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.KEYWORD,
      settings: {
        matchType: 'must_contain',
        keyword: ['exchange', 'refund', 'credit'],
      },
    });
    const result = await handler.evaluate(criteria, makeContext());
    expect(result.passed).toBe(true);
    expect(result.reasoning).toContain('refund');
  });
});

// ==========================================================================
// PromptHandler
// ==========================================================================
describe('PromptHandler', () => {
  const handler = new PromptHandler();

  it('should return fallback when no llmEvaluate is provided', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.PROMPT,
      settings: { description: 'Was the agent polite?', evaluationType: 'boolean' },
      threshold: { expectedValue: true },
    });
    const result = await handler.evaluate(criteria, makeContext());
    expect(result.result).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('No LLM evaluator');
  });

  it('should return score fallback (5) when no llmEvaluate for score type', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.PROMPT,
      settings: { description: 'Rate the agent', evaluationType: 'score' },
    });
    const result = await handler.evaluate(criteria, makeContext());
    expect(result.result).toBe(5);
  });

  it('should return fallback when transcript is empty', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.PROMPT,
      settings: { description: 'Was the agent polite?', evaluationType: 'boolean' },
    });
    const ctx = makeContext({
      transcriptText: '',
      llmEvaluate: jest.fn(),
    });
    const result = await handler.evaluate(criteria, ctx);
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('No transcript');
  });

  it('should call llmEvaluate and return its result (boolean)', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: true,
      passed: true,
      reasoning: 'Agent was very polite throughout.',
      evidence: ['Hello, how can I help you today?'],
      confidence: 0.95,
    });

    const criteria = makeCriteria({
      type: CriteriaType.PROMPT,
      settings: { description: 'Was the agent polite?', evaluationType: 'boolean' },
      threshold: { expectedValue: true },
    });

    const ctx = makeContext({ llmEvaluate: mockLlm });
    const result = await handler.evaluate(criteria, ctx);

    expect(mockLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        criterionName: 'Test Criterion',
        description: 'Was the agent polite?',
        evaluationType: 'boolean',
        threshold: { type: 'boolean', expectedValue: true },
      }),
    );
    expect(result.result).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.reasoning).toBe('Agent was very polite throughout.');
    expect(result.evidence).toHaveLength(1);
  });

  it('should call llmEvaluate for score-type criteria', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: 8,
      passed: true,
      reasoning: 'Good performance overall.',
      evidence: [],
    });

    const criteria = makeCriteria({
      type: CriteriaType.PROMPT,
      settings: { description: 'Rate empathy', evaluationType: 'score' },
      threshold: { min: 7, max: 10 },
    });

    const ctx = makeContext({ llmEvaluate: mockLlm });
    const result = await handler.evaluate(criteria, ctx);

    expect(mockLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluationType: 'score',
        threshold: { type: 'numerical', min: 7, max: 10 },
      }),
    );
    expect(result.result).toBe(8);
    expect(result.passed).toBe(true);
  });

  it('should handle LLM errors gracefully', async () => {
    const mockLlm = jest.fn().mockRejectedValue(new Error('API timeout'));

    const criteria = makeCriteria({
      type: CriteriaType.PROMPT,
      settings: { description: 'Rate', evaluationType: 'score' },
    });

    const ctx = makeContext({ llmEvaluate: mockLlm });
    const result = await handler.evaluate(criteria, ctx);

    expect(result.result).toBe(5);
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('API timeout');
  });
});

// ==========================================================================
// ResponseTimeHandler
// ==========================================================================
describe('ResponseTimeHandler', () => {
  const handler = new ResponseTimeHandler();

  it('should use firstResponseLatency from metrics', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.RESPONSE_TIME,
      settings: { participant: 'agent' },
      threshold: { max: 5 },
    });
    const result = await handler.evaluate(criteria, makeContext());
    expect(result.result).toBe(1.5);
    expect(result.passed).toBe(true);
    expect(result.reasoning).toContain('1.5s');
  });

  it('should fail when response time exceeds threshold', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.RESPONSE_TIME,
      settings: { participant: 'agent' },
      threshold: { max: 1 },
    });
    const result = await handler.evaluate(criteria, makeContext());
    expect(result.result).toBe(1.5);
    expect(result.passed).toBe(false);
  });

  it('should fallback to avgSegmentLength when no firstResponseLatency', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.RESPONSE_TIME,
      settings: { participant: 'agent' },
      threshold: { max: 5 },
    });
    const ctx = makeContext({
      metrics: {
        duration: 26,
        avgSegmentLength: { agent: 2.5 },
      },
    });
    const result = await handler.evaluate(criteria, ctx);
    expect(result.result).toBe(2.5);
    expect(result.passed).toBe(true);
  });

  it('should return failed when no data available', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.RESPONSE_TIME,
      settings: { participant: 'agent' },
    });
    const ctx = makeContext({ metrics: undefined, segments: [] });
    const result = await handler.evaluate(criteria, ctx);
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('No response time data');
  });
});

// ==========================================================================
// ToolCallHandler
// ==========================================================================
describe('ToolCallHandler', () => {
  const handler = new ToolCallHandler();

  it('should pass when expected tool was called', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.TOOL_CALL,
      settings: { expectedTool: 'process_refund' },
    });
    const ctx = makeContext({
      toolCalls: [
        { name: 'lookup_customer', arguments: {} },
        { name: 'process_refund', arguments: { amount: 100 } },
      ],
    });
    const result = await handler.evaluate(criteria, ctx);
    expect(result.result).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('should fail when expected tool was NOT called', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.TOOL_CALL,
      settings: { expectedTool: 'escalate_to_manager' },
    });
    const ctx = makeContext({
      toolCalls: [{ name: 'lookup_customer', arguments: {} }],
    });
    const result = await handler.evaluate(criteria, ctx);
    expect(result.result).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('NOT called');
  });

  it('should handle array of expected tools', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.TOOL_CALL,
      settings: { expectedTool: ['refund', 'process_refund'] },
    });
    const ctx = makeContext({
      toolCalls: [{ name: 'process_refund', arguments: {} }],
    });
    const result = await handler.evaluate(criteria, ctx);
    expect(result.passed).toBe(true);
  });

  it('should handle function.name format', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.TOOL_CALL,
      settings: { expectedTool: 'search_kb' },
    });
    const ctx = makeContext({
      toolCalls: [
        { name: '', function: { name: 'search_kb' }, arguments: {} },
      ],
    });
    const result = await handler.evaluate(criteria, ctx);
    expect(result.passed).toBe(true);
  });

  it('should fail gracefully when no tool calls exist', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.TOOL_CALL,
      settings: { expectedTool: 'process_refund' },
    });
    const result = await handler.evaluate(criteria, makeContext());
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('none');
  });
});

// ==========================================================================
// Scoring Utilities
// ==========================================================================
describe('checkThreshold', () => {
  it('should return true when no threshold is set', () => {
    const criteria = makeCriteria({
      type: CriteriaType.KEYWORD,
      settings: { matchType: 'must_contain', keyword: 'test' },
    });
    expect(checkThreshold(criteria, true)).toBe(true);
  });

  it('should check boolean threshold', () => {
    const criteria = makeCriteria({
      type: CriteriaType.KEYWORD,
      settings: { matchType: 'must_contain', keyword: 'test' },
      threshold: { expectedValue: true },
    });
    expect(checkThreshold(criteria, true)).toBe(true);
    expect(checkThreshold(criteria, false)).toBe(false);
  });

  it('should check numerical min/max threshold', () => {
    const criteria = makeCriteria({
      type: CriteriaType.RESPONSE_TIME,
      settings: { participant: 'agent' },
      threshold: { min: 1, max: 5 },
    });
    expect(checkThreshold(criteria, 3)).toBe(true);
    expect(checkThreshold(criteria, 0.5)).toBe(false);
    expect(checkThreshold(criteria, 6)).toBe(false);
  });

  it('should check percentage threshold', () => {
    const criteria = makeCriteria({
      type: CriteriaType.RESPONSE_TIME,
      settings: { participant: 'agent' },
      threshold: { minPercentage: 30, maxPercentage: 70 },
    });
    expect(checkThreshold(criteria, 50)).toBe(true);
    expect(checkThreshold(criteria, 20)).toBe(false);
    expect(checkThreshold(criteria, 80)).toBe(false);
  });
});

describe('normalizeScore', () => {
  it('should return 10 for boolean true', () => {
    const criteria = makeCriteria({
      type: CriteriaType.KEYWORD,
      settings: { matchType: 'must_contain', keyword: 'test' },
    });
    expect(normalizeScore(true, criteria)).toBe(10);
  });

  it('should return 0 for boolean false', () => {
    const criteria = makeCriteria({
      type: CriteriaType.KEYWORD,
      settings: { matchType: 'must_contain', keyword: 'test' },
    });
    expect(normalizeScore(false, criteria)).toBe(0);
  });

  it('should clamp score to 0-10', () => {
    const criteria = makeCriteria({
      type: CriteriaType.PROMPT,
      settings: { description: 'test', evaluationType: 'score' },
    });
    expect(normalizeScore(8, criteria)).toBe(8);
    expect(normalizeScore(12, criteria)).toBe(10);
    expect(normalizeScore(-2, criteria)).toBe(0);
  });

  it('should normalize percentage: 50% → 5', () => {
    const criteria = makeCriteria({
      type: CriteriaType.RESPONSE_TIME,
      settings: { participant: 'agent' },
      threshold: { minPercentage: 0, maxPercentage: 100 },
    });
    expect(normalizeScore(50, criteria)).toBe(5);
    expect(normalizeScore(100, criteria)).toBe(10);
  });

  it('should normalize number with min/max threshold', () => {
    const criteria = makeCriteria({
      type: CriteriaType.RESPONSE_TIME,
      settings: { participant: 'agent' },
      threshold: { min: 1, max: 5 },
    });
    // Within range → 10
    expect(normalizeScore(3, criteria)).toBe(10);
    // Below min by 1 → 10 - 1 = 9 (clamped to ≥0)
    expect(normalizeScore(0, criteria)).toBe(9);
    // Above max by 3 → 10 - 3 = 7
    expect(normalizeScore(8, criteria)).toBe(7);
  });

  it('should normalize number with only min threshold', () => {
    const criteria = makeCriteria({
      type: CriteriaType.RESPONSE_TIME,
      settings: { participant: 'agent' },
      threshold: { min: 10 },
    });
    // 10/10 * 10 = 10
    expect(normalizeScore(10, criteria)).toBe(10);
    // 5/10 * 10 = 5
    expect(normalizeScore(5, criteria)).toBe(5);
  });
});
