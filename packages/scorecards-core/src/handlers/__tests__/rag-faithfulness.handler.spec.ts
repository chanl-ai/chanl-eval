import { RagFaithfulnessHandler } from '../rag-faithfulness.handler';
import { EvaluationContext } from '../criteria-handler.interface';
import { ScorecardCriteria, CriteriaType } from '../../schemas';

// Helper: create a minimal criteria object
function makeCriteria(
  overrides: Partial<ScorecardCriteria> & { type: string; settings: any },
): ScorecardCriteria {
  const base: any = {
    key: 'rag_faith_key',
    name: 'RAG Faithfulness',
    version: 1,
    isActive: true,
  };
  return { ...base, ...overrides } as ScorecardCriteria;
}

// Shared evaluation context
function makeContext(overrides?: Partial<EvaluationContext>): EvaluationContext {
  return {
    transcriptText:
      'Agent: Based on our records, your order #1234 shipped on March 15.\nCustomer: Thanks for checking.\nAgent: You are welcome. Is there anything else?',
    segments: [],
    toolCalls: [],
    ...overrides,
  };
}

describe('RagFaithfulnessHandler', () => {
  const handler = new RagFaithfulnessHandler();

  it('should have type "rag_faithfulness"', () => {
    expect(handler.type).toBe('rag_faithfulness');
  });

  // ---- No tool calls scenarios ----

  it('should skip when no toolCalls in context', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.RAG_FAITHFULNESS,
      settings: {},
    });
    const ctx = makeContext({ toolCalls: undefined });
    const result = await handler.evaluate(criteria, ctx);

    expect(result.passed).toBe(true);
    expect(result.result).toBe(true);
    expect(result.reasoning).toContain('No retrieval tools detected');
    expect(result.evidence).toEqual([]);
  });

  it('should skip when toolCalls present but none match retrieval names', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.RAG_FAITHFULNESS,
      settings: {},
    });
    const ctx = makeContext({
      toolCalls: [
        { name: 'process_refund', arguments: { amount: 100 }, result: { success: true } },
        { name: 'send_email', arguments: { to: 'user@test.com' }, result: { sent: true } },
      ],
    });
    const result = await handler.evaluate(criteria, ctx);

    expect(result.passed).toBe(true);
    expect(result.reasoning).toContain('No retrieval tools detected');
  });

  // ---- Default retrieval tool name matching ----

  it('should match tool calls with default retrieval name "search"', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: true,
      passed: true,
      reasoning: 'Agent responses are faithful to retrieved documents.',
      evidence: ['Order #1234 shipped on March 15 matches document'],
    });

    const criteria = makeCriteria({
      type: CriteriaType.RAG_FAITHFULNESS,
      settings: {},
    });
    const ctx = makeContext({
      toolCalls: [
        {
          name: 'search',
          arguments: { query: 'order 1234' },
          result: { documents: [{ text: 'Order #1234 shipped March 15' }] },
        },
      ],
      llmEvaluate: mockLlm,
    });

    const result = await handler.evaluate(criteria, ctx);

    expect(mockLlm).toHaveBeenCalledTimes(1);
    const callArgs = mockLlm.mock.calls[0][0];
    expect(callArgs.transcript).toContain('## Retrieved Documents');
    expect(callArgs.transcript).toContain('## Conversation Transcript');
    expect(callArgs.transcript).toContain('Order #1234 shipped March 15');
    expect(result.passed).toBe(true);
    expect(result.evidence).toHaveLength(1);
  });

  it('should match tool calls with default name "kb_search"', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: true,
      passed: true,
      reasoning: 'Faithful.',
      evidence: [],
    });

    const criteria = makeCriteria({
      type: CriteriaType.RAG_FAITHFULNESS,
      settings: {},
    });
    const ctx = makeContext({
      toolCalls: [
        { name: 'kb_search', arguments: { q: 'policy' }, result: { docs: [] } },
      ],
      llmEvaluate: mockLlm,
    });

    await handler.evaluate(criteria, ctx);
    expect(mockLlm).toHaveBeenCalledTimes(1);
  });

  // ---- Custom retrieval tool names ----

  it('should match tool calls with custom retrievalToolNames from settings', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: true,
      passed: true,
      reasoning: 'All claims supported.',
      evidence: [],
    });

    const criteria = makeCriteria({
      type: CriteriaType.RAG_FAITHFULNESS,
      settings: { retrievalToolNames: ['custom_kb'] },
    });
    const ctx = makeContext({
      toolCalls: [
        { name: 'custom_kb', arguments: { query: 'test' }, result: { data: 'some docs' } },
        { name: 'search', arguments: { q: 'other' }, result: { data: 'ignored' } },
      ],
      llmEvaluate: mockLlm,
    });

    await handler.evaluate(criteria, ctx);

    // Only custom_kb should match (not "search" since we overrode the defaults)
    const callArgs = mockLlm.mock.calls[0][0];
    expect(callArgs.transcript).toContain('custom_kb');
    expect(callArgs.transcript).not.toContain('"tool":"search"');
  });

  // ---- LLM evaluate interaction ----

  it('should call llmEvaluate with transcript containing retrieved documents', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: true,
      passed: true,
      reasoning: 'Faithful to sources.',
      evidence: ['Claim A matches doc 1'],
    });

    const criteria = makeCriteria({
      type: CriteriaType.RAG_FAITHFULNESS,
      settings: {},
      threshold: { expectedValue: true },
    });
    const ctx = makeContext({
      toolCalls: [
        {
          name: 'retrieve',
          arguments: { docId: 'abc' },
          result: { content: 'Policy: 30-day returns accepted' },
        },
      ],
      llmEvaluate: mockLlm,
    });

    const result = await handler.evaluate(criteria, ctx);

    expect(mockLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        criterionName: 'RAG Faithfulness',
        evaluationType: 'boolean',
        threshold: { type: 'boolean', expectedValue: true },
      }),
    );
    // Transcript should contain both sections
    const transcript = mockLlm.mock.calls[0][0].transcript;
    expect(transcript).toContain('## Retrieved Documents');
    expect(transcript).toContain('30-day returns accepted');
    expect(transcript).toContain('## Conversation Transcript');
    expect(result.result).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('should return passed: false when llmEvaluate returns passed: false', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: false,
      passed: false,
      reasoning: 'Agent fabricated a 60-day return policy not in documents.',
      evidence: ['Agent said "60-day return" but documents say "30-day"'],
    });

    const criteria = makeCriteria({
      type: CriteriaType.RAG_FAITHFULNESS,
      settings: {},
    });
    const ctx = makeContext({
      toolCalls: [
        { name: 'search', arguments: {}, result: { text: '30-day return policy' } },
      ],
      llmEvaluate: mockLlm,
    });

    const result = await handler.evaluate(criteria, ctx);

    expect(result.passed).toBe(false);
    expect(result.result).toBe(false);
    expect(result.reasoning).toContain('fabricated');
  });

  // ---- No llmEvaluate ----

  it('should return passed: false when no llmEvaluate is available', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.RAG_FAITHFULNESS,
      settings: {},
    });
    const ctx = makeContext({
      toolCalls: [
        { name: 'search', arguments: {}, result: { data: 'some docs' } },
      ],
      // No llmEvaluate
    });

    const result = await handler.evaluate(criteria, ctx);

    expect(result.passed).toBe(false);
    expect(result.result).toBe(false);
    expect(result.reasoning).toContain('LLM evaluator not available');
  });

  // ---- Empty transcript ----

  it('should skip when transcript is empty', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.RAG_FAITHFULNESS,
      settings: {},
    });
    const ctx = makeContext({
      transcriptText: '',
      toolCalls: [
        { name: 'search', arguments: {}, result: { data: 'docs' } },
      ],
      llmEvaluate: jest.fn(),
    });

    const result = await handler.evaluate(criteria, ctx);

    expect(result.passed).toBe(true);
    expect(result.result).toBe(true);
    expect(result.reasoning).toContain('Empty transcript');
  });

  it('should skip when transcript is whitespace only', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.RAG_FAITHFULNESS,
      settings: {},
    });
    const ctx = makeContext({
      transcriptText: '   \n  ',
      toolCalls: [
        { name: 'knowledge_search', arguments: {}, result: {} },
      ],
      llmEvaluate: jest.fn(),
    });

    const result = await handler.evaluate(criteria, ctx);
    expect(result.passed).toBe(true);
    expect(result.reasoning).toContain('Empty transcript');
  });

  // ---- Error handling ----

  it('should catch llmEvaluate errors and return fallback', async () => {
    const mockLlm = jest.fn().mockRejectedValue(new Error('OpenAI rate limit'));

    const criteria = makeCriteria({
      type: CriteriaType.RAG_FAITHFULNESS,
      settings: {},
    });
    const ctx = makeContext({
      toolCalls: [
        { name: 'search', arguments: {}, result: { data: 'docs' } },
      ],
      llmEvaluate: mockLlm,
    });

    const result = await handler.evaluate(criteria, ctx);

    expect(result.passed).toBe(false);
    expect(result.result).toBe(false);
    expect(result.reasoning).toContain('OpenAI rate limit');
    expect(result.reasoning).toContain('RAG faithfulness evaluation failed');
  });

  // ---- function.name format ----

  it('should match tool calls using function.name format', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: true,
      passed: true,
      reasoning: 'Faithful.',
      evidence: [],
    });

    const criteria = makeCriteria({
      type: CriteriaType.RAG_FAITHFULNESS,
      settings: {},
    });
    const ctx = makeContext({
      toolCalls: [
        { name: '', function: { name: 'search' }, arguments: {}, result: { docs: ['doc1'] } },
      ],
      llmEvaluate: mockLlm,
    });

    await handler.evaluate(criteria, ctx);
    expect(mockLlm).toHaveBeenCalledTimes(1);
  });

  // ---- Score evaluation type ----

  it('should pass score evaluationType to llmEvaluate', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: 8,
      passed: true,
      reasoning: 'High faithfulness.',
      evidence: [],
    });

    const criteria = makeCriteria({
      type: CriteriaType.RAG_FAITHFULNESS,
      settings: { evaluationType: 'score' },
      threshold: { min: 7, max: 10 },
    });
    const ctx = makeContext({
      toolCalls: [
        { name: 'search', arguments: {}, result: { text: 'facts' } },
      ],
      llmEvaluate: mockLlm,
    });

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
});
