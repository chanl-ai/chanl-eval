import { ConversationCompletenessHandler } from '../conversation-completeness.handler';
import { EvaluationContext } from '../criteria-handler.interface';
import { ScorecardCriteria, CriteriaType } from '../../schemas';

// Helper: create a minimal criteria object (same pattern as handlers.spec.ts)
function makeCriteria(
  overrides: Partial<ScorecardCriteria> & { type: string; settings: any },
): ScorecardCriteria {
  const base: any = {
    key: 'conversation_completeness_check',
    name: 'Conversation Completeness Check',
    version: 1,
    isActive: true,
  };
  return { ...base, ...overrides } as ScorecardCriteria;
}

function makeContext(overrides?: Partial<EvaluationContext>): EvaluationContext {
  return {
    transcriptText:
      'Customer: I need to return my laptop and also change my shipping address.\nAgent: I can help with the return. Let me process that for you.\nCustomer: What about my address change?\nAgent: Your return has been initiated. You will receive a shipping label via email.',
    segments: [
      { speaker: 'customer', text: 'I need to return my laptop and also change my shipping address.', startTime: 0, endTime: 5, duration: 5 },
      { speaker: 'agent', text: 'I can help with the return. Let me process that for you.', startTime: 6, endTime: 10, duration: 4 },
      { speaker: 'customer', text: 'What about my address change?', startTime: 11, endTime: 13, duration: 2 },
      { speaker: 'agent', text: 'Your return has been initiated. You will receive a shipping label via email.', startTime: 14, endTime: 19, duration: 5 },
    ],
    ...overrides,
  };
}

describe('ConversationCompletenessHandler', () => {
  const handler = new ConversationCompletenessHandler();

  it('should have type "conversation_completeness"', () => {
    expect(handler.type).toBe('conversation_completeness');
  });

  // ======================================================================
  // Guard: no llmEvaluate
  // ======================================================================
  it('should return fallback when no llmEvaluate is available', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.CONVERSATION_COMPLETENESS,
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
      type: CriteriaType.CONVERSATION_COMPLETENESS,
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
      type: CriteriaType.CONVERSATION_COMPLETENESS,
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
  it('should call llmEvaluate with the conversation completeness rubric', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: 4,
      passed: false,
      reasoning: 'Agent addressed the return but ignored the shipping address change request.',
      evidence: ['Customer asked about address change at turn 3, agent did not respond to it'],
    });

    const criteria = makeCriteria({
      type: CriteriaType.CONVERSATION_COMPLETENESS,
      settings: {},
      threshold: { min: 7, max: 10 },
    });

    const ctx = makeContext({ llmEvaluate: mockLlm });
    const result = await handler.evaluate(criteria, ctx);

    // Verify llmEvaluate was called with the right rubric
    expect(mockLlm).toHaveBeenCalledTimes(1);
    const callArgs = mockLlm.mock.calls[0][0];
    expect(callArgs.description).toContain('every distinct concern, question, or request');
    expect(callArgs.description).toContain('fully addressed it, partially addressed it, or ignored it');
    expect(callArgs.evaluationType).toBe('score');
    expect(callArgs.transcript).toContain('shipping address');

    expect(result.result).toBe(4);
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('ignored the shipping address');
  });

  // ======================================================================
  // llmEvaluate returns result — handler passes through
  // ======================================================================
  it('should pass through llmEvaluate result and passed flag', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: 8,
      passed: true,
      reasoning: 'All concerns addressed.',
      evidence: ['Return processed', 'Address updated'],
    });

    const criteria = makeCriteria({
      type: CriteriaType.CONVERSATION_COMPLETENESS,
      settings: {},
    });

    const ctx = makeContext({ llmEvaluate: mockLlm });
    const result = await handler.evaluate(criteria, ctx);

    expect(result.result).toBe(8);
    expect(result.passed).toBe(true);
    expect(result.reasoning).toBe('All concerns addressed.');
    expect(result.evidence).toEqual(['Return processed', 'Address updated']);
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
      type: CriteriaType.CONVERSATION_COMPLETENESS,
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
      reasoning: 'Complete.',
      evidence: [],
    });

    const criteria = makeCriteria({
      type: CriteriaType.CONVERSATION_COMPLETENESS,
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
    const mockLlm = jest.fn().mockRejectedValue(new Error('Service unavailable'));

    const criteria = makeCriteria({
      type: CriteriaType.CONVERSATION_COMPLETENESS,
      settings: {},
    });

    const ctx = makeContext({ llmEvaluate: mockLlm });
    const result = await handler.evaluate(criteria, ctx);

    expect(result.result).toBe(5);
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('failed');
    expect(result.reasoning).toContain('Service unavailable');
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
      type: CriteriaType.CONVERSATION_COMPLETENESS,
      name: 'Issue Resolution Rate',
      settings: {},
    });

    const ctx = makeContext({ llmEvaluate: mockLlm });
    await handler.evaluate(criteria, ctx);

    expect(mockLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        criterionName: 'Issue Resolution Rate',
      }),
    );
  });
});
