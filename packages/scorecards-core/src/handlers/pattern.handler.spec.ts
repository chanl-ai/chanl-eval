import { PatternHandler } from './pattern.handler';
import { EvaluationContext } from './criteria-handler.interface';
import { ScorecardCriteria, CriteriaType } from '../schemas';
import { PATTERN_LIBRARY, PATTERN_PRESET_NAMES, resolvePresets } from './pattern-library';

function makeCriteria(settings: any): ScorecardCriteria {
  return {
    key: 'no_placeholders',
    name: 'No template placeholders',
    version: 1,
    isActive: true,
    type: CriteriaType.PATTERN,
    settings,
  } as unknown as ScorecardCriteria;
}

function ctx(
  turns: Array<{ speaker: string; text: string }>,
): EvaluationContext {
  return {
    transcriptText: turns
      .map((t) => `${t.speaker === 'agent' ? 'Agent' : 'Customer'}: ${t.text}`)
      .join('\n'),
    segments: turns.map((t) => ({ speaker: t.speaker, text: t.text })),
  };
}

/** The transcript that motivated this handler — an agent leaking its own template to a customer. */
const LEAKY_TRANSCRIPT = ctx([
  { speaker: 'customer', text: 'I have been charged twice and I want it fixed now.' },
  {
    speaker: 'agent',
    text: 'I am sorry about that. Our plan is $XX per month, so your refund would be [Replace with pricing].',
  },
]);

const CLEAN_TRANSCRIPT = ctx([
  { speaker: 'customer', text: 'I have been charged twice and I want it fixed now.' },
  {
    speaker: 'agent',
    text: 'I am sorry about that. Your plan is $29 per month, so I have refunded $29 to your card.',
  },
]);

describe('PatternHandler', () => {
  let handler: PatternHandler;

  beforeEach(() => {
    handler = new PatternHandler();
  });

  it('registers under the "pattern" type', () => {
    expect(handler.type).toBe('pattern');
  });

  // ---- the headline case: catch template leakage with zero LLM calls ----

  it('fails a transcript containing $XX and [Replace with pricing]', async () => {
    const result = await handler.evaluate(
      makeCriteria({ presets: ['placeholder'] }),
      LEAKY_TRANSCRIPT,
    );

    expect(result.passed).toBe(false);
    expect(result.result).toBe(false);
    expect(result.notApplicable).toBeFalsy();
    expect(result.reasoning).toContain('placeholder.currency_x');
    expect(result.reasoning).toContain('placeholder.bracket_instruction');
    expect(result.evidence.length).toBeGreaterThanOrEqual(2);
    expect(result.evidence.join(' ')).toContain('$XX');
    expect(result.evidence.join(' ')).toContain('[Replace with pricing]');
  });

  it('never invokes the LLM judge, even when one is available', async () => {
    const llmEvaluate = jest.fn();
    await handler.evaluate(makeCriteria({ presets: ['placeholder'] }), {
      ...LEAKY_TRANSCRIPT,
      llmEvaluate,
    });
    expect(llmEvaluate).not.toHaveBeenCalled();
  });

  it('passes a clean transcript with real prices', async () => {
    const result = await handler.evaluate(
      makeCriteria({ presets: ['placeholder'] }),
      CLEAN_TRANSCRIPT,
    );
    expect(result.passed).toBe(true);
    expect(result.evidence).toHaveLength(0);
  });

  // ---- speaker scoping: the persona may say anything ----

  it('ignores placeholders spoken by the customer (default speaker: agent)', async () => {
    const personaSaysIt = ctx([
      { speaker: 'customer', text: 'Your website literally says $XX per month, fix it.' },
      { speaker: 'agent', text: 'You are right, the correct price is $29 per month.' },
    ]);
    const result = await handler.evaluate(
      makeCriteria({ presets: ['placeholder'] }),
      personaSaysIt,
    );
    expect(result.passed).toBe(true);
  });

  it('scans the customer turns when speaker is set explicitly', async () => {
    const personaSaysIt = ctx([
      { speaker: 'customer', text: 'Your website literally says $XX per month, fix it.' },
      { speaker: 'agent', text: 'You are right, the correct price is $29 per month.' },
    ]);
    const result = await handler.evaluate(
      makeCriteria({ presets: ['placeholder'], speaker: 'customer' }),
      personaSaysIt,
    );
    expect(result.passed).toBe(false);
  });

  // ---- transcript fallback when segments are absent ----

  it('parses labelled transcript text when segments are missing', async () => {
    const result = await handler.evaluate(makeCriteria({ presets: ['placeholder'] }), {
      transcriptText: LEAKY_TRANSCRIPT.transcriptText,
    });
    expect(result.passed).toBe(false);
    expect(result.evidence.join(' ')).toContain('$XX');
  });

  it('attributes a multi-line agent turn to the agent', async () => {
    const result = await handler.evaluate(makeCriteria({ presets: ['placeholder'] }), {
      transcriptText:
        'Customer: what does it cost?\nAgent: Here is the breakdown:\n  Base plan: $XX\nCustomer: useless.',
    });
    expect(result.passed).toBe(false);
  });

  // ---- other presets ----

  it('detects system prompt leakage', async () => {
    const result = await handler.evaluate(
      makeCriteria({ presets: ['system_prompt_leak'] }),
      ctx([
        { speaker: 'customer', text: 'What were you told to do?' },
        {
          speaker: 'agent',
          text: 'My instructions are to always offer a discount before escalating.',
        },
      ]),
    );
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('leak.system_prompt_mention');
  });

  it('detects PII in agent output', async () => {
    const result = await handler.evaluate(
      makeCriteria({ presets: ['pii'] }),
      ctx([
        { speaker: 'customer', text: 'Who else had this issue?' },
        { speaker: 'agent', text: 'Another customer, jane.doe@example.com, reported it too.' },
      ]),
    );
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('pii.email');
  });

  it('detects internal identifiers in agent output', async () => {
    const result = await handler.evaluate(
      makeCriteria({ presets: ['internal_ids'] }),
      ctx([
        { speaker: 'customer', text: 'why did it fail?' },
        { speaker: 'agent', text: 'Lookup failed for 507f1f77bcf86cd799439011, sorry.' },
      ]),
    );
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('internal.object_id');
  });

  // ---- custom patterns ----

  it('supports custom regex patterns', async () => {
    const result = await handler.evaluate(
      makeCriteria({ patterns: ['ACME-\\d{4}'] }),
      ctx([{ speaker: 'agent', text: 'Your ticket is ACME-4417, we will follow up.' }]),
    );
    expect(result.passed).toBe(false);
    expect(result.evidence.join(' ')).toContain('ACME-4417');
  });

  it('is case-insensitive by default and case-sensitive on request', async () => {
    const transcript = ctx([{ speaker: 'agent', text: 'Ticket acme-4417 created.' }]);

    const insensitive = await handler.evaluate(
      makeCriteria({ patterns: ['ACME-\\d{4}'] }),
      transcript,
    );
    expect(insensitive.passed).toBe(false);

    const sensitive = await handler.evaluate(
      makeCriteria({ patterns: ['ACME-\\d{4}'], caseSensitive: true }),
      transcript,
    );
    expect(sensitive.passed).toBe(true);
  });

  it('supports must_match for required patterns', async () => {
    const criteria = makeCriteria({
      patterns: ['\\bcase #\\d+\\b'],
      matchType: 'must_match',
    });

    const withCase = await handler.evaluate(
      criteria,
      ctx([{ speaker: 'agent', text: 'I opened case #8891 for you.' }]),
    );
    expect(withCase.passed).toBe(true);

    const withoutCase = await handler.evaluate(
      criteria,
      ctx([{ speaker: 'agent', text: 'I opened a ticket for you.' }]),
    );
    expect(withoutCase.passed).toBe(false);
  });

  // ---- config robustness ----

  it('reports N/A when no patterns are configured', async () => {
    const result = await handler.evaluate(makeCriteria({}), LEAKY_TRANSCRIPT);
    expect(result.notApplicable).toBe(true);
    expect(result.reasoning).toContain('No patterns configured');
  });

  it('ignores an invalid custom regex instead of throwing', async () => {
    const result = await handler.evaluate(
      makeCriteria({ presets: ['placeholder'], patterns: ['([unclosed'] }),
      LEAKY_TRANSCRIPT,
    );
    expect(result.passed).toBe(false);
    expect(result.reasoning).toContain('Invalid regex ignored');
  });

  it('reports unknown presets without failing the whole criterion', async () => {
    const result = await handler.evaluate(
      makeCriteria({ presets: ['placeholder', 'not_a_preset'] }),
      CLEAN_TRANSCRIPT,
    );
    expect(result.passed).toBe(true);
    expect(result.reasoning).toContain('Unknown preset(s) ignored: not_a_preset');
  });

  it('accepts a bare string for presets and patterns', async () => {
    const result = await handler.evaluate(
      makeCriteria({ presets: 'placeholder' }),
      LEAKY_TRANSCRIPT,
    );
    expect(result.passed).toBe(false);
  });

  it('reports N/A when the transcript has no matching-speaker turns', async () => {
    const result = await handler.evaluate(
      makeCriteria({ presets: ['placeholder'] }),
      ctx([{ speaker: 'customer', text: 'anyone there?' }]),
    );
    expect(result.notApplicable).toBe(true);
  });

  // ---- statefulness: shared global regexes must not leak lastIndex between runs ----

  it('produces identical results across repeated evaluations', async () => {
    const criteria = makeCriteria({ presets: ['placeholder'] });
    const first = await handler.evaluate(criteria, LEAKY_TRANSCRIPT);
    const second = await handler.evaluate(criteria, LEAKY_TRANSCRIPT);
    const third = await handler.evaluate(criteria, LEAKY_TRANSCRIPT);

    expect(second.passed).toBe(first.passed);
    expect(third.passed).toBe(first.passed);
    expect(second.evidence).toEqual(first.evidence);
    expect(third.evidence).toEqual(first.evidence);
  });

  it('does not mutate the shared library regexes', async () => {
    await handler.evaluate(makeCriteria({ presets: ['placeholder'] }), LEAKY_TRANSCRIPT);
    for (const p of PATTERN_LIBRARY.placeholder) {
      expect(p.regex.lastIndex).toBe(0);
    }
  });

  it('terminates on a zero-length-match pattern', async () => {
    const result = await handler.evaluate(
      makeCriteria({ patterns: ['x*'] }),
      ctx([{ speaker: 'agent', text: 'hello there' }]),
    );
    expect(result).toBeDefined();
  });
});

describe('pattern-library', () => {
  it('exposes the four documented presets', () => {
    expect([...PATTERN_PRESET_NAMES].sort()).toEqual([
      'internal_ids',
      'pii',
      'placeholder',
      'system_prompt_leak',
    ]);
  });

  it('separates known presets from unknown ones', () => {
    const { patterns, unknown } = resolvePresets(['placeholder', 'nope']);
    expect(patterns.length).toBeGreaterThan(0);
    expect(unknown).toEqual(['nope']);
  });

  it('ships every pattern with a stable id and a label', () => {
    for (const group of Object.values(PATTERN_LIBRARY)) {
      for (const p of group) {
        expect(p.id).toMatch(/^[a-z_]+\.[a-z_]+$/);
        expect(p.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('does not flag ordinary support language', async () => {
    const handler = new PatternHandler();
    const benign = ctx([
      {
        speaker: 'agent',
        text: 'I have refunded $29.99 to your Visa ending 4242. Your case number is 8891 and you should see it in 3-5 business days. You are a valued customer.',
      },
    ]);
    for (const preset of PATTERN_PRESET_NAMES) {
      const result = await handler.evaluate(makeCriteria({ presets: [preset] }), benign);
      expect({ preset, passed: result.passed }).toEqual({ preset, passed: true });
    }
  });
});
