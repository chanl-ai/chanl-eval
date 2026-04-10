import {
  parseJsonResponse,
  validateScenario,
  validatePersona,
  validateCriterion,
  validateScorecard,
  generateTestSuite,
} from '../scenario-generator.service';

// ─── parseJsonResponse ───────────────────────────────────────────────

describe('parseJsonResponse', () => {
  it('parses plain JSON', () => {
    const result = parseJsonResponse('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('strips markdown code fences', () => {
    const result = parseJsonResponse('```json\n{"key": "value"}\n```');
    expect(result).toEqual({ key: 'value' });
  });

  it('strips code fences without json language tag', () => {
    const result = parseJsonResponse('```\n{"key": "value"}\n```');
    expect(result).toEqual({ key: 'value' });
  });

  it('throws on garbage input', () => {
    expect(() => parseJsonResponse('not json at all')).toThrow();
  });

  it('throws on empty string', () => {
    expect(() => parseJsonResponse('')).toThrow();
  });
});

// ─── validateScenario ────────────────────────────────────────────────

describe('validateScenario', () => {
  const valid = {
    name: 'Test Scenario',
    prompt: 'I need help with my order',
    category: 'support',
    difficulty: 'medium',
    description: 'Tests order help',
    tags: ['test'],
  };

  it('accepts valid scenario', () => {
    const result = validateScenario(valid);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Test Scenario');
    expect(result!.category).toBe('support');
    expect(result!.difficulty).toBe('medium');
  });

  it('rejects missing name', () => {
    expect(validateScenario({ prompt: 'hello' })).toBeNull();
  });

  it('rejects missing prompt', () => {
    expect(validateScenario({ name: 'test' })).toBeNull();
  });

  it('coerces invalid category to support', () => {
    const result = validateScenario({ ...valid, category: 'invalid' });
    expect(result!.category).toBe('support');
  });

  it('coerces invalid difficulty to medium', () => {
    const result = validateScenario({ ...valid, difficulty: 'extreme' });
    expect(result!.difficulty).toBe('medium');
  });

  it('preserves valid context', () => {
    const result = validateScenario({
      ...valid,
      context: { situation: 'Order issue', objective: 'Get refund' },
    });
    expect(result!.context).toEqual({ situation: 'Order issue', objective: 'Get refund' });
  });
});

// ─── validatePersona ─────────────────────────────────────────────────

describe('validatePersona', () => {
  const valid = {
    name: 'Jane Smith',
    gender: 'female',
    emotion: 'frustrated',
    intentClarity: 'very clear',
    speechStyle: 'normal',
    description: 'A frustrated customer',
    backstory: 'Bought a laptop that broke',
    behavior: {
      personality: 'assertive',
      cooperationLevel: 'difficult',
      patience: 'impatient',
      communicationStyle: 'direct',
    },
    tags: ['test'],
  };

  it('accepts valid persona', () => {
    const result = validatePersona(valid);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Jane Smith');
    expect(result!.emotion).toBe('frustrated');
    expect(result!.behavior.cooperationLevel).toBe('difficult');
  });

  it('rejects missing name', () => {
    expect(validatePersona({ emotion: 'calm' })).toBeNull();
  });

  it('coerces invalid emotion to neutral', () => {
    const result = validatePersona({ ...valid, emotion: 'super_angry' });
    expect(result!.emotion).toBe('neutral');
  });

  it('coerces invalid gender to female', () => {
    const result = validatePersona({ ...valid, gender: 'other' });
    expect(result!.gender).toBe('female');
  });

  it('coerces invalid cooperation to cooperative', () => {
    const result = validatePersona({
      ...valid,
      behavior: { ...valid.behavior, cooperationLevel: 'evil' },
    });
    expect(result!.behavior.cooperationLevel).toBe('cooperative');
  });

  it('handles missing behavior gracefully', () => {
    const result = validatePersona({ name: 'Test', gender: 'male' });
    expect(result).not.toBeNull();
    expect(result!.behavior.personality).toBe('professional');
  });
});

// ─── validateCriterion ───────────────────────────────────────────────

describe('validateCriterion', () => {
  it('accepts all 9 valid handler types', () => {
    const types = [
      'prompt', 'keyword', 'response_time', 'tool_call',
      'hallucination', 'knowledge_retention', 'conversation_completeness',
      'role_adherence', 'rag_faithfulness',
    ];
    for (const type of types) {
      const result = validateCriterion({ key: `test_${type}`, name: `Test ${type}`, type, settings: {} });
      expect(result).not.toBeNull();
      expect(result!.type).toBe(type);
    }
  });

  it('rejects unknown handler type', () => {
    expect(validateCriterion({ key: 'bad', name: 'Bad', type: 'sentiment_analysis', settings: {} })).toBeNull();
  });

  it('rejects missing key', () => {
    expect(validateCriterion({ name: 'Test', type: 'keyword', settings: {} })).toBeNull();
  });

  it('rejects missing name', () => {
    expect(validateCriterion({ key: 'test', type: 'keyword', settings: {} })).toBeNull();
  });
});

// ─── validateScorecard ───────────────────────────────────────────────

describe('validateScorecard', () => {
  it('accepts valid scorecard with criteria', () => {
    const result = validateScorecard({
      name: 'Test Scorecard',
      description: 'Tests agent quality',
      criteria: [
        { key: 'politeness', name: 'Politeness', type: 'prompt', settings: { description: 'Is the agent polite?', evaluationType: 'score' } },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.criteria.length).toBe(1);
  });

  it('rejects scorecard with no valid criteria', () => {
    const result = validateScorecard({
      name: 'Bad Scorecard',
      criteria: [
        { key: 'bad', name: 'Bad', type: 'nonexistent_type', settings: {} },
      ],
    });
    expect(result).toBeNull();
  });

  it('rejects missing name', () => {
    expect(validateScorecard({ criteria: [{ key: 'a', name: 'A', type: 'keyword', settings: {} }] })).toBeNull();
  });

  it('filters out invalid criteria and keeps valid ones', () => {
    const result = validateScorecard({
      name: 'Mixed',
      criteria: [
        { key: 'good', name: 'Good', type: 'keyword', settings: {} },
        { key: 'bad', name: 'Bad', type: 'fake_type', settings: {} },
        { key: 'also_good', name: 'Also Good', type: 'prompt', settings: {} },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.criteria.length).toBe(2);
  });
});

// ─── generateTestSuite ───────────────────────────────────────────────

describe('generateTestSuite', () => {
  it('throws when no API key is configured', async () => {
    // Clear env vars to ensure no key is found
    const origOpenAI = process.env.CHANL_OPENAI_API_KEY;
    const origAnthropic = process.env.CHANL_ANTHROPIC_API_KEY;
    delete process.env.CHANL_OPENAI_API_KEY;
    delete process.env.CHANL_ANTHROPIC_API_KEY;

    await expect(
      generateTestSuite({ systemPrompt: 'You are a test agent' }),
    ).rejects.toThrow(/API key/i);

    // Restore
    if (origOpenAI) process.env.CHANL_OPENAI_API_KEY = origOpenAI;
    if (origAnthropic) process.env.CHANL_ANTHROPIC_API_KEY = origAnthropic;
  });
});
