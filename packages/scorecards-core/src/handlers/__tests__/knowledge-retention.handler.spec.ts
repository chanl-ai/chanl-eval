import { KnowledgeRetentionHandler } from '../knowledge-retention.handler';
import { EvaluationContext } from '../criteria-handler.interface';
import { ScorecardCriteria, CriteriaType } from '../../schemas';

// Helper: create a minimal criteria object (same pattern as handlers.spec.ts)
function makeCriteria(
  overrides: Partial<ScorecardCriteria> & { type: string; settings: any },
): ScorecardCriteria {
  const base: any = {
    key: 'knowledge_retention_check',
    name: 'Knowledge Retention Check',
    version: 1,
    isActive: true,
  };
  return { ...base, ...overrides } as ScorecardCriteria;
}

function makeContext(overrides?: Partial<EvaluationContext>): EvaluationContext {
  return {
    transcriptText:
      'Customer: My name is Sarah and my order number is 12345.\nAgent: Let me look that up for you, Sarah.\nCustomer: I also ordered item #67890 last week.\nAgent: I can see order 12345 and item #67890 in your account, Sarah.',
    segments: [
      { speaker: 'customer', text: 'My name is Sarah and my order number is 12345.', startTime: 0, endTime: 4, duration: 4 },
      { speaker: 'agent', text: 'Let me look that up for you, Sarah.', startTime: 5, endTime: 8, duration: 3 },
      { speaker: 'customer', text: 'I also ordered item #67890 last week.', startTime: 9, endTime: 12, duration: 3 },
      { speaker: 'agent', text: 'I can see order 12345 and item #67890 in your account, Sarah.', startTime: 13, endTime: 18, duration: 5 },
    ],
    ...overrides,
  };
}

describe('KnowledgeRetentionHandler', () => {
  const handler = new KnowledgeRetentionHandler();

  it('should have type "knowledge_retention"', () => {
    expect(handler.type).toBe('knowledge_retention');
  });

  // ======================================================================
  // Guard: no llmEvaluate
  // ======================================================================
  it('should return fallback when no llmEvaluate is available', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.KNOWLEDGE_RETENTION,
      settings: {},
    });
    const ctx = makeContext({ llmEvaluate: undefined });
    const result = await handler.evaluate(criteria, ctx);

    expect(result.result).toBe(5);
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('LLM evaluator not available');
    expect(result.evidence).toEqual([]);
  });

  // ======================================================================
  // Guard: empty transcript
  // ======================================================================
  it('should return fallback when transcript is empty', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.KNOWLEDGE_RETENTION,
      settings: {},
    });
    const ctx = makeContext({
      transcriptText: '',
      llmEvaluate: jest.fn(),
    });
    const result = await handler.evaluate(criteria, ctx);

    expect(result.result).toBe(5);
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('Empty transcript');
    expect(result.evidence).toEqual([]);
  });

  it('should return fallback when transcript is only whitespace', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.KNOWLEDGE_RETENTION,
      settings: {},
    });
    const ctx = makeContext({
      transcriptText: '   \n  ',
      llmEvaluate: jest.fn(),
    });
    const result = await handler.evaluate(criteria, ctx);

    expect(result.result).toBe(5);
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('Empty transcript');
  });

  // ======================================================================
  // Happy path: llmEvaluate called with correct rubric
  // ======================================================================
  it('should call llmEvaluate with the knowledge retention rubric', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: 8,
      passed: true,
      reasoning: 'Agent correctly recalled customer name and both order numbers.',
      evidence: ['Agent referenced "Sarah" by name', 'Agent recalled order 12345 and item #67890'],
    });

    const criteria = makeCriteria({
      type: CriteriaType.KNOWLEDGE_RETENTION,
      settings: {},
      threshold: { min: 7, max: 10 },
    });

    const ctx = makeContext({ llmEvaluate: mockLlm });
    const result = await handler.evaluate(criteria, ctx);

    // Verify llmEvaluate was called with the right rubric
    expect(mockLlm).toHaveBeenCalledTimes(1);
    const callArgs = mockLlm.mock.calls[0][0];
    expect(callArgs.description).toContain('facts, names, products, order numbers');
    expect(callArgs.description).toContain('recall these details in subsequent turns');
    expect(callArgs.evaluationType).toBe('score');
    expect(callArgs.transcript).toContain('Sarah');

    expect(result.result).toBe(8);
    expect(result.passed).toBe(true);
    expect(result.reasoning).toContain('recalled customer name');
  });

  // ======================================================================
  // llmEvaluate returns result — handler passes through
  // ======================================================================
  it('should pass through llmEvaluate result and passed flag', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: 8,
      passed: true,
      reasoning: 'Good retention.',
      evidence: ['Evidence A'],
    });

    const criteria = makeCriteria({
      type: CriteriaType.KNOWLEDGE_RETENTION,
      settings: {},
    });

    const ctx = makeContext({ llmEvaluate: mockLlm });
    const result = await handler.evaluate(criteria, ctx);

    expect(result.result).toBe(8);
    expect(result.passed).toBe(true);
    expect(result.reasoning).toBe('Good retention.');
    expect(result.evidence).toEqual(['Evidence A']);
  });

  // ======================================================================
  // Default evaluationType is 'score'
  // ======================================================================
  it('should default evaluationType to "score"', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: 7,
      passed: true,
      reasoning: 'OK',
      evidence: [],
    });

    const criteria = makeCriteria({
      type: CriteriaType.KNOWLEDGE_RETENTION,
      settings: {},
    });

    const ctx = makeContext({ llmEvaluate: mockLlm });
    await handler.evaluate(criteria, ctx);

    expect(mockLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluationType: 'score',
      }),
    );
  });

  it('should use evaluationType from settings when provided', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: true,
      passed: true,
      reasoning: 'Perfect retention.',
      evidence: [],
    });

    const criteria = makeCriteria({
      type: CriteriaType.KNOWLEDGE_RETENTION,
      settings: { evaluationType: 'boolean' },
      threshold: { expectedValue: true },
    });

    const ctx = makeContext({ llmEvaluate: mockLlm });
    await handler.evaluate(criteria, ctx);

    expect(mockLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluationType: 'boolean',
        threshold: { type: 'boolean', expectedValue: true },
      }),
    );
  });

  // ======================================================================
  // Error handling: llmEvaluate throws
  // ======================================================================
  it('should catch errors and return fallback result', async () => {
    const mockLlm = jest.fn().mockRejectedValue(new Error('API timeout'));

    const criteria = makeCriteria({
      type: CriteriaType.KNOWLEDGE_RETENTION,
      settings: {},
    });

    const ctx = makeContext({ llmEvaluate: mockLlm });
    const result = await handler.evaluate(criteria, ctx);

    expect(result.result).toBe(5);
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('failed');
    expect(result.reasoning).toContain('API timeout');
    expect(result.evidence).toEqual([]);
  });

  // ======================================================================
  // Verify criterionName is passed from criteria.name
  // ======================================================================
  it('should pass criterionName from criteria.name', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: 9,
      passed: true,
      reasoning: 'OK',
      evidence: [],
    });

    const criteria = makeCriteria({
      type: CriteriaType.KNOWLEDGE_RETENTION,
      name: 'Custom Retention Metric',
      settings: {},
    });

    const ctx = makeContext({ llmEvaluate: mockLlm });
    await handler.evaluate(criteria, ctx);

    expect(mockLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        criterionName: 'Custom Retention Metric',
      }),
    );
  });
});
