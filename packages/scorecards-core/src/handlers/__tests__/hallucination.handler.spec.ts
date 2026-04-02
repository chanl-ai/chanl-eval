import { HallucinationHandler } from '../hallucination.handler';
import { EvaluationContext } from '../criteria-handler.interface';
import { ScorecardCriteria, CriteriaType } from '../../schemas';

// Helper: create a minimal criteria object (same pattern as handlers.spec.ts)
function makeCriteria(
  overrides: Partial<ScorecardCriteria> & { type: string; settings: any },
): ScorecardCriteria {
  const base: any = {
    key: 'hallucination_check',
    name: 'Hallucination Check',
    version: 1,
    isActive: true,
  };
  return { ...base, ...overrides } as ScorecardCriteria;
}

function makeContext(overrides?: Partial<EvaluationContext>): EvaluationContext {
  return {
    transcriptText:
      'Agent: Your order was shipped on March 15th via FedEx.\nCustomer: Great, when will it arrive?\nAgent: It should arrive by March 20th.',
    segments: [
      { speaker: 'agent', text: 'Your order was shipped on March 15th via FedEx.', startTime: 0, endTime: 4, duration: 4 },
      { speaker: 'customer', text: 'Great, when will it arrive?', startTime: 5, endTime: 7, duration: 2 },
      { speaker: 'agent', text: 'It should arrive by March 20th.', startTime: 8, endTime: 11, duration: 3 },
    ],
    ...overrides,
  };
}

describe('HallucinationHandler', () => {
  const handler = new HallucinationHandler();

  it('should have type "hallucination"', () => {
    expect(handler.type).toBe('hallucination');
  });

  // ======================================================================
  // Guard: no groundTruth
  // ======================================================================
  it('should skip when no groundTruth is provided', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.HALLUCINATION,
      settings: {},
    });
    const ctx = makeContext({ groundTruth: undefined });
    const result = await handler.evaluate(criteria, ctx);

    expect(result.passed).toBe(true);
    expect(result.result).toBe(true);
    expect(result.reasoning).toContain('No ground truth');
    expect(result.evidence).toEqual([]);
  });

  // ======================================================================
  // Guard: no llmEvaluate
  // ======================================================================
  it('should fail when no llmEvaluate is available', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.HALLUCINATION,
      settings: {},
    });
    const ctx = makeContext({
      groundTruth: 'Order shipped March 15 via FedEx.',
      llmEvaluate: undefined,
    });
    const result = await handler.evaluate(criteria, ctx);

    expect(result.passed).toBe(false);
    expect(result.result).toBe(false);
    expect(result.reasoning).toContain('LLM evaluator not available');
    expect(result.evidence).toEqual([]);
  });

  // ======================================================================
  // Guard: empty transcript
  // ======================================================================
  it('should skip when transcript is empty', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.HALLUCINATION,
      settings: {},
    });
    const ctx = makeContext({
      transcriptText: '',
      groundTruth: 'Order shipped March 15 via FedEx.',
      llmEvaluate: jest.fn(),
    });
    const result = await handler.evaluate(criteria, ctx);

    expect(result.passed).toBe(true);
    expect(result.result).toBe(true);
    expect(result.reasoning).toContain('Empty transcript');
    expect(result.evidence).toEqual([]);
  });

  it('should skip when transcript is only whitespace', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.HALLUCINATION,
      settings: {},
    });
    const ctx = makeContext({
      transcriptText: '   \n  ',
      groundTruth: 'Some facts.',
      llmEvaluate: jest.fn(),
    });
    const result = await handler.evaluate(criteria, ctx);

    expect(result.passed).toBe(true);
    expect(result.reasoning).toContain('Empty transcript');
  });

  // ======================================================================
  // Happy path: llmEvaluate called with enhanced transcript
  // ======================================================================
  it('should call llmEvaluate with transcript containing ground truth header', async () => {
    const groundTruth = 'Order #12345 shipped March 15 via FedEx. Estimated delivery March 20.';
    const mockLlm = jest.fn().mockResolvedValue({
      result: true,
      passed: true,
      reasoning: 'All agent claims are supported by ground truth.',
      evidence: [],
      confidence: 0.92,
    });

    const criteria = makeCriteria({
      type: CriteriaType.HALLUCINATION,
      settings: {},
      threshold: { expectedValue: true },
    });

    const ctx = makeContext({
      groundTruth,
      llmEvaluate: mockLlm,
    });

    const result = await handler.evaluate(criteria, ctx);

    // Verify llmEvaluate was called with enhanced transcript
    expect(mockLlm).toHaveBeenCalledTimes(1);
    const callArgs = mockLlm.mock.calls[0][0];
    expect(callArgs.transcript).toContain('## Ground Truth Facts');
    expect(callArgs.transcript).toContain(groundTruth);
    expect(callArgs.transcript).toContain('## Conversation Transcript');
    expect(callArgs.transcript).toContain(ctx.transcriptText);

    expect(result.result).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.reasoning).toBe('All agent claims are supported by ground truth.');
  });

  // ======================================================================
  // Verify evaluationType defaults to 'boolean'
  // ======================================================================
  it('should pass evaluationType "boolean" by default', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: true,
      passed: true,
      reasoning: 'No hallucinations detected.',
      evidence: [],
    });

    const criteria = makeCriteria({
      type: CriteriaType.HALLUCINATION,
      settings: {},
    });

    const ctx = makeContext({
      groundTruth: 'Some facts.',
      llmEvaluate: mockLlm,
    });

    await handler.evaluate(criteria, ctx);

    expect(mockLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluationType: 'boolean',
      }),
    );
  });

  it('should use evaluationType from settings when provided', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: 8,
      passed: true,
      reasoning: 'Minor fabrication detected.',
      evidence: ['Agent mentioned a discount not in ground truth.'],
    });

    const criteria = makeCriteria({
      type: CriteriaType.HALLUCINATION,
      settings: { evaluationType: 'score' },
      threshold: { min: 7, max: 10 },
    });

    const ctx = makeContext({
      groundTruth: 'Product costs $50. No discounts available.',
      llmEvaluate: mockLlm,
    });

    await handler.evaluate(criteria, ctx);

    expect(mockLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluationType: 'score',
        threshold: { type: 'numerical', min: 7, max: 10 },
      }),
    );
  });

  // ======================================================================
  // LLM returns passed: false (hallucination detected)
  // ======================================================================
  it('should return passed: false when llmEvaluate detects hallucination', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: false,
      passed: false,
      reasoning: 'Agent fabricated a delivery date not in ground truth.',
      evidence: ['Agent claimed arrival by March 20th, but ground truth has no delivery estimate.'],
    });

    const criteria = makeCriteria({
      type: CriteriaType.HALLUCINATION,
      settings: {},
      threshold: { expectedValue: true },
    });

    const ctx = makeContext({
      groundTruth: 'Order shipped March 15 via FedEx.',
      llmEvaluate: mockLlm,
    });

    const result = await handler.evaluate(criteria, ctx);

    expect(result.passed).toBe(false);
    expect(result.result).toBe(false);
    expect(result.reasoning).toContain('fabricated');
    expect(result.evidence).toHaveLength(1);
  });

  // ======================================================================
  // Error handling: llmEvaluate throws
  // ======================================================================
  it('should catch errors and return failed result', async () => {
    const mockLlm = jest.fn().mockRejectedValue(new Error('Rate limit exceeded'));

    const criteria = makeCriteria({
      type: CriteriaType.HALLUCINATION,
      settings: {},
    });

    const ctx = makeContext({
      groundTruth: 'Some ground truth.',
      llmEvaluate: mockLlm,
    });

    const result = await handler.evaluate(criteria, ctx);

    expect(result.passed).toBe(false);
    expect(result.result).toBe(false);
    expect(result.reasoning).toContain('failed');
    expect(result.reasoning).toContain('Rate limit exceeded');
    expect(result.evidence).toEqual([]);
  });

  // ======================================================================
  // Verify criterionName is passed from criteria.name
  // ======================================================================
  it('should pass criterionName from criteria.name', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: true,
      passed: true,
      reasoning: 'OK',
      evidence: [],
    });

    const criteria = makeCriteria({
      type: CriteriaType.HALLUCINATION,
      name: 'Custom Hallucination Check',
      settings: {},
    });

    const ctx = makeContext({
      groundTruth: 'Facts here.',
      llmEvaluate: mockLlm,
    });

    await handler.evaluate(criteria, ctx);

    expect(mockLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        criterionName: 'Custom Hallucination Check',
      }),
    );
  });

  // ======================================================================
  // Verify description passed to llmEvaluate
  // ======================================================================
  it('should pass the hallucination-specific description to llmEvaluate', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: true,
      passed: true,
      reasoning: 'OK',
      evidence: [],
    });

    const criteria = makeCriteria({
      type: CriteriaType.HALLUCINATION,
      settings: {},
    });

    const ctx = makeContext({
      groundTruth: 'Facts.',
      llmEvaluate: mockLlm,
    });

    await handler.evaluate(criteria, ctx);

    const callArgs = mockLlm.mock.calls[0][0];
    expect(callArgs.description).toContain('contradict');
    expect(callArgs.description).toContain('fabricate');
    expect(callArgs.description).toContain('ground truth');
  });
});
