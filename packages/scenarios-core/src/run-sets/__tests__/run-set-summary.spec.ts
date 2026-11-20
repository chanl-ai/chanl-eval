import { compareRunSets, RunInput, summarizeRunSet } from '../run-set-summary';

const pass = (executionId: string, personaId: string): RunInput => ({
  executionId,
  personaId,
  status: 'completed',
  result: {
    passed: true,
    criteriaResults: [{ criteriaKey: 'verify', criteriaName: 'Verifies first', passed: true }],
  },
});

const fail = (executionId: string, personaId: string, needsReview = false): RunInput => ({
  executionId,
  personaId,
  status: 'completed',
  result: {
    passed: false,
    criteriaResults: [
      {
        criteriaKey: needsReview ? 'tone' : 'verify',
        criteriaName: needsReview ? 'Tone' : 'Verifies first',
        passed: false,
        reasoning: 'refund before verify',
        evidence: needsReview ? [] : ['1. issue_refund({})'],
        ...(needsReview ? { needsReview: true } : {}),
      },
    ],
  },
});

describe('run-set summary', () => {
  it('computes counts, label, most failed check and per-persona verdicts on a mixed set', () => {
    const s = summarizeRunSet(
      ['held', 'broken', 'review'],
      [
        pass('e1', 'held'),
        pass('e2', 'held'),
        fail('e3', 'broken'),
        pass('e4', 'broken'),
        fail('e5', 'review', true),
        pass('e6', 'review'),
      ],
      { held: 'Calm', broken: 'Liar', review: 'Vague' },
    );

    expect(s).toMatchObject({
      status: 'completed',
      total: 6,
      completed: 6,
      passed: 4,
      passK: false,
      passAtK: true,
      label: 'Flaky',
      mostFailedCheck: { key: 'verify', name: 'Verifies first', failed: 1 },
    });
    expect(s.byPersona.map((p) => [p.personaName, p.verdict])).toEqual([
      ['Calm', 'Held'],
      ['Liar', 'Broken'],
      ['Vague', 'Needs review'],
    ]);
    expect(s.byPersona[1].evidence).toBe('Verifies first: 1. issue_refund({})');

    const running = summarizeRunSet(['held'], [pass('e1', 'held'), { ...pass('e2', 'held'), status: 'running' }]);
    expect(running).toMatchObject({ status: 'running', completed: 1, label: null, passK: false });
  });

  it('marks a check that fails more often after the change as regressed', () => {
    const c = compareRunSets(
      { k: 2, runs: [pass('b1', 'p'), pass('b2', 'p')] },
      { k: 2, runs: [fail('a1', 'p'), pass('a2', 'p')] },
    );
    expect(c.before).toEqual({ passed: 2, k: 2, passK: true });
    expect(c.after).toEqual({ passed: 1, k: 2, passK: false });
    expect(c.checks).toEqual([
      { key: 'verify', name: 'Verifies first', beforeFailed: 0, afterFailed: 1, change: 'regressed' },
    ]);
  });
});
