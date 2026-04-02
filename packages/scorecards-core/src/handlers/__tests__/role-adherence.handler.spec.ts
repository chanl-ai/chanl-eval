import { RoleAdherenceHandler } from '../role-adherence.handler';
import { EvaluationContext } from '../criteria-handler.interface';
import { ScorecardCriteria, CriteriaType } from '../../schemas';

// Helper: create a minimal criteria object (same pattern as handlers.spec.ts)
function makeCriteria(
  overrides: Partial<ScorecardCriteria> & { type: string; settings: any },
): ScorecardCriteria {
  const base: any = {
    key: 'role_adherence_check',
    name: 'Role Adherence Check',
    version: 1,
    isActive: true,
  };
  return { ...base, ...overrides } as ScorecardCriteria;
}

function makeContext(overrides?: Partial<EvaluationContext>): EvaluationContext {
  return {
    transcriptText:
      'Customer: Can you help me with a refund?\nAgent: Of course! I am your dedicated support specialist. Let me pull up your account.\nCustomer: Are you a real person?\nAgent: I am here to help you with any questions about your order.',
    segments: [
      { speaker: 'customer', text: 'Can you help me with a refund?', startTime: 0, endTime: 3, duration: 3 },
      { speaker: 'agent', text: 'Of course! I am your dedicated support specialist. Let me pull up your account.', startTime: 4, endTime: 9, duration: 5 },
      { speaker: 'customer', text: 'Are you a real person?', startTime: 10, endTime: 12, duration: 2 },
      { speaker: 'agent', text: 'I am here to help you with any questions about your order.', startTime: 13, endTime: 17, duration: 4 },
    ],
    ...overrides,
  };
}

describe('RoleAdherenceHandler', () => {
  const handler = new RoleAdherenceHandler();

  it('should have type "role_adherence"', () => {
    expect(handler.type).toBe('role_adherence');
  });

  // ======================================================================
  // Guard: no llmEvaluate
  // ======================================================================
  it('should return fallback when no llmEvaluate is available', async () => {
    const criteria = makeCriteria({
      type: CriteriaType.ROLE_ADHERENCE,
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
      type: CriteriaType.ROLE_ADHERENCE,
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
      type: CriteriaType.ROLE_ADHERENCE,
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
  it('should call llmEvaluate with the role adherence rubric', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: 9,
      passed: true,
      reasoning: 'Agent maintained role throughout, deflected identity question naturally.',
      evidence: ['Agent stayed in character when asked "Are you a real person?"'],
    });

    const criteria = makeCriteria({
      type: CriteriaType.ROLE_ADHERENCE,
      settings: {},
      threshold: { min: 7, max: 10 },
    });

    const ctx = makeContext({ llmEvaluate: mockLlm });
    const result = await handler.evaluate(criteria, ctx);

    // Verify llmEvaluate was called with the right rubric
    expect(mockLlm).toHaveBeenCalledTimes(1);
    const callArgs = mockLlm.mock.calls[0][0];
    expect(callArgs.description).toContain('maintained its assigned role and persona');
    expect(callArgs.description).toContain('breaking character');
    expect(callArgs.description).toContain('As an AI');
    expect(callArgs.evaluationType).toBe('score');
    expect(callArgs.transcript).toContain('Are you a real person');

    expect(result.result).toBe(9);
    expect(result.passed).toBe(true);
    expect(result.reasoning).toContain('maintained role');
  });

  // ======================================================================
  // llmEvaluate returns result — handler passes through
  // ======================================================================
  it('should pass through llmEvaluate result and passed flag', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: 8,
      passed: true,
      reasoning: 'Good role adherence.',
      evidence: ['Consistent persona'],
    });

    const criteria = makeCriteria({
      type: CriteriaType.ROLE_ADHERENCE,
      settings: {},
    });

    const ctx = makeContext({ llmEvaluate: mockLlm });
    const result = await handler.evaluate(criteria, ctx);

    expect(result.result).toBe(8);
    expect(result.passed).toBe(true);
    expect(result.reasoning).toBe('Good role adherence.');
    expect(result.evidence).toEqual(['Consistent persona']);
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
      type: CriteriaType.ROLE_ADHERENCE,
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
      reasoning: 'Perfect adherence.',
      evidence: [],
    });

    const criteria = makeCriteria({
      type: CriteriaType.ROLE_ADHERENCE,
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
  // LLM detects role break
  // ======================================================================
  it('should return passed: false when agent breaks character', async () => {
    const mockLlm = jest.fn().mockResolvedValue({
      result: 3,
      passed: false,
      reasoning: 'Agent broke character by saying "As an AI, I cannot..."',
      evidence: ['Agent said "As an AI language model, I don\'t have access to real accounts"'],
    });

    const criteria = makeCriteria({
      type: CriteriaType.ROLE_ADHERENCE,
      settings: {},
      threshold: { min: 7, max: 10 },
    });

    const ctx = makeContext({ llmEvaluate: mockLlm });
    const result = await handler.evaluate(criteria, ctx);

    expect(result.passed).toBe(false);
    expect(result.result).toBe(3);
    expect(result.reasoning).toContain('broke character');
    expect(result.evidence).toHaveLength(1);
  });

  // ======================================================================
  // Error handling: llmEvaluate throws
  // ======================================================================
  it('should catch errors and return fallback result', async () => {
    const mockLlm = jest.fn().mockRejectedValue(new Error('Model overloaded'));

    const criteria = makeCriteria({
      type: CriteriaType.ROLE_ADHERENCE,
      settings: {},
    });

    const ctx = makeContext({ llmEvaluate: mockLlm });
    const result = await handler.evaluate(criteria, ctx);

    expect(result.result).toBe(5);
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('failed');
    expect(result.reasoning).toContain('Model overloaded');
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
      type: CriteriaType.ROLE_ADHERENCE,
      name: 'Persona Consistency',
      settings: {},
    });

    const ctx = makeContext({ llmEvaluate: mockLlm });
    await handler.evaluate(criteria, ctx);

    expect(mockLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        criterionName: 'Persona Consistency',
      }),
    );
  });
});
