import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  buildBaseline,
  saveBaseline,
  loadBaseline,
  compareWithBaseline,
  assertionKey,
  type BaselineFile,
} from '../baseline';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeResult(overrides: Record<string, any> = {}) {
  return {
    file: 'test-refund.yaml',
    scenarioName: 'angry-customer-refund',
    assertions: [
      { type: 'keyword', description: 'keyword-refund', passed: true },
      { type: 'response_time', description: 'response_time', passed: true },
      { type: 'prompt', description: 'de-escalation', passed: false },
    ],
    ...overrides,
  };
}

function makeResult2(overrides: Record<string, any> = {}) {
  return {
    file: 'test-billing.yaml',
    scenarioName: 'billing-dispute',
    assertions: [
      { type: 'keyword', description: 'mentions-policy', passed: true },
      { type: 'score', description: 'quality-score', passed: true },
    ],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* assertionKey                                                        */
/* ------------------------------------------------------------------ */

describe('assertionKey', () => {
  it('uses description when available', () => {
    expect(assertionKey({ type: 'keyword', description: 'keyword-refund' }, 0)).toBe(
      'keyword-refund',
    );
  });

  it('falls back to type-index when no description', () => {
    expect(assertionKey({ type: 'keyword' }, 2)).toBe('keyword-2');
  });

  it('falls back to type-index when description is empty string', () => {
    expect(assertionKey({ type: 'score', description: '' }, 0)).toBe('score-0');
  });

  it('falls back to type-index when description is whitespace', () => {
    expect(assertionKey({ type: 'prompt', description: '   ' }, 1)).toBe('prompt-1');
  });
});

/* ------------------------------------------------------------------ */
/* buildBaseline                                                       */
/* ------------------------------------------------------------------ */

describe('buildBaseline', () => {
  it('builds baseline from test results', () => {
    const baseline = buildBaseline([makeResult()]);

    expect(baseline.version).toBe(1);
    expect(baseline.savedAt).toBeDefined();
    expect(baseline.results['test-refund.yaml']).toBeDefined();

    const entry = baseline.results['test-refund.yaml'];
    expect(entry.score).toBe(67); // 2 of 3 passing = 66.67 -> 67
    expect(entry.assertions['keyword-refund']).toBe(true);
    expect(entry.assertions['response_time']).toBe(true);
    expect(entry.assertions['de-escalation']).toBe(false);
  });

  it('handles multiple test files', () => {
    const baseline = buildBaseline([makeResult(), makeResult2()]);

    expect(Object.keys(baseline.results)).toHaveLength(2);
    expect(baseline.results['test-refund.yaml']).toBeDefined();
    expect(baseline.results['test-billing.yaml']).toBeDefined();
  });

  it('skips errored tests', () => {
    const baseline = buildBaseline([
      makeResult({ error: 'Something went wrong' }),
    ]);

    expect(Object.keys(baseline.results)).toHaveLength(0);
  });

  it('handles results with all passing assertions (score 100)', () => {
    const baseline = buildBaseline([
      makeResult({
        assertions: [
          { type: 'keyword', description: 'kw', passed: true },
          { type: 'score', description: 'sc', passed: true },
        ],
      }),
    ]);

    expect(baseline.results['test-refund.yaml'].score).toBe(100);
  });

  it('handles results with all failing assertions (score 0)', () => {
    const baseline = buildBaseline([
      makeResult({
        assertions: [
          { type: 'keyword', description: 'kw', passed: false },
          { type: 'score', description: 'sc', passed: false },
        ],
      }),
    ]);

    expect(baseline.results['test-refund.yaml'].score).toBe(0);
  });

  it('handles empty assertions (score null)', () => {
    const baseline = buildBaseline([
      makeResult({ assertions: [] }),
    ]);

    expect(baseline.results['test-refund.yaml'].score).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* saveBaseline / loadBaseline                                         */
/* ------------------------------------------------------------------ */

describe('saveBaseline / loadBaseline', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chanl-baseline-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('saves and loads a baseline file', () => {
    const filePath = path.join(tmpDir, '.chanl-baseline.json');
    const results = [makeResult(), makeResult2()];

    saveBaseline(results, filePath);

    expect(fs.existsSync(filePath)).toBe(true);

    const loaded = loadBaseline(filePath);
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(1);
    expect(loaded!.results['test-refund.yaml']).toBeDefined();
    expect(loaded!.results['test-billing.yaml']).toBeDefined();
  });

  it('returns null when file does not exist', () => {
    const result = loadBaseline(path.join(tmpDir, 'nonexistent.json'));
    expect(result).toBeNull();
  });

  it('throws on unsupported version', () => {
    const filePath = path.join(tmpDir, 'bad-baseline.json');
    fs.writeFileSync(
      filePath,
      JSON.stringify({ version: 99, savedAt: '', results: {} }),
    );

    expect(() => loadBaseline(filePath)).toThrow('Unsupported baseline version');
  });

  it('returns the file path from saveBaseline', () => {
    const filePath = path.join(tmpDir, 'custom.json');
    const returned = saveBaseline([makeResult()], filePath);
    expect(returned).toBe(filePath);
  });
});

/* ------------------------------------------------------------------ */
/* compareWithBaseline                                                 */
/* ------------------------------------------------------------------ */

describe('compareWithBaseline', () => {
  it('detects unchanged results', () => {
    const results = [makeResult()];
    const baseline = buildBaseline(results);

    const comparison = compareWithBaseline(results, baseline);

    expect(comparison.hasRegressions).toBe(false);
    expect(comparison.summary.unchanged).toBe(1);
    expect(comparison.summary.improved).toBe(0);
    expect(comparison.summary.regressed).toBe(0);

    const test = comparison.tests[0];
    expect(test.status).toBe('unchanged');
    expect(test.scoreDelta).toBe(0);
  });

  it('detects improved assertions (was failing, now passing)', () => {
    const before = [makeResult()]; // de-escalation: false
    const baseline = buildBaseline(before);

    // Now de-escalation passes
    const after = [
      makeResult({
        assertions: [
          { type: 'keyword', description: 'keyword-refund', passed: true },
          { type: 'response_time', description: 'response_time', passed: true },
          { type: 'prompt', description: 'de-escalation', passed: true },
        ],
      }),
    ];

    const comparison = compareWithBaseline(after, baseline);

    expect(comparison.hasRegressions).toBe(false);
    expect(comparison.summary.improved).toBe(1);
    expect(comparison.summary.unchanged).toBe(0);

    const test = comparison.tests[0];
    expect(test.status).toBe('improved');
    // Score: was 67 (2/3), now 100 (3/3)
    expect(test.scoreDelta).toBe(33);

    const deEscalation = test.assertions.find((a) => a.name === 'de-escalation');
    expect(deEscalation).toBeDefined();
    expect(deEscalation!.status).toBe('improved');
    expect(deEscalation!.before).toBe(false);
    expect(deEscalation!.after).toBe(true);
  });

  it('detects regressed assertions (was passing, now failing)', () => {
    const before = [makeResult()]; // keyword-refund: true
    const baseline = buildBaseline(before);

    // Now keyword-refund fails
    const after = [
      makeResult({
        assertions: [
          { type: 'keyword', description: 'keyword-refund', passed: false },
          { type: 'response_time', description: 'response_time', passed: true },
          { type: 'prompt', description: 'de-escalation', passed: false },
        ],
      }),
    ];

    const comparison = compareWithBaseline(after, baseline);

    expect(comparison.hasRegressions).toBe(true);
    expect(comparison.summary.regressed).toBe(1);

    const test = comparison.tests[0];
    expect(test.status).toBe('regressed');

    const kwRefund = test.assertions.find((a) => a.name === 'keyword-refund');
    expect(kwRefund).toBeDefined();
    expect(kwRefund!.status).toBe('regressed');
    expect(kwRefund!.before).toBe(true);
    expect(kwRefund!.after).toBe(false);
  });

  it('detects new tests (added)', () => {
    const baseline: BaselineFile = {
      version: 1,
      savedAt: '2026-01-01T00:00:00Z',
      results: {
        'test-refund.yaml': {
          score: 67,
          assertions: { 'keyword-refund': true },
        },
      },
    };

    const currentResults = [
      makeResult({
        assertions: [
          { type: 'keyword', description: 'keyword-refund', passed: true },
        ],
      }),
      makeResult2(),
    ];

    const comparison = compareWithBaseline(currentResults, baseline);

    expect(comparison.summary.added).toBe(1);
    const addedTest = comparison.tests.find((t) => t.file === 'test-billing.yaml');
    expect(addedTest).toBeDefined();
    expect(addedTest!.status).toBe('added');
  });

  it('detects removed tests', () => {
    const baseline: BaselineFile = {
      version: 1,
      savedAt: '2026-01-01T00:00:00Z',
      results: {
        'test-refund.yaml': {
          score: 67,
          assertions: { 'keyword-refund': true },
        },
        'test-billing.yaml': {
          score: 100,
          assertions: { 'mentions-policy': true },
        },
      },
    };

    // Only run test-refund this time (test-billing was removed/errored)
    const currentResults = [
      makeResult({
        assertions: [
          { type: 'keyword', description: 'keyword-refund', passed: true },
        ],
      }),
    ];

    const comparison = compareWithBaseline(currentResults, baseline);

    expect(comparison.summary.removed).toBe(1);
    const removedTest = comparison.tests.find(
      (t) => t.file === 'test-billing.yaml',
    );
    expect(removedTest).toBeDefined();
    expect(removedTest!.status).toBe('removed');
  });

  it('handles mixed improvements and regressions across tests', () => {
    const baseline: BaselineFile = {
      version: 1,
      savedAt: '2026-01-01T00:00:00Z',
      results: {
        'test-refund.yaml': {
          score: 67,
          assertions: {
            'keyword-refund': true,
            response_time: true,
            'de-escalation': false,
          },
        },
        'test-billing.yaml': {
          score: 100,
          assertions: {
            'mentions-policy': true,
            'quality-score': true,
          },
        },
      },
    };

    const currentResults = [
      // test-refund: de-escalation improved
      makeResult({
        assertions: [
          { type: 'keyword', description: 'keyword-refund', passed: true },
          { type: 'response_time', description: 'response_time', passed: true },
          { type: 'prompt', description: 'de-escalation', passed: true },
        ],
      }),
      // test-billing: mentions-policy regressed
      makeResult2({
        assertions: [
          { type: 'keyword', description: 'mentions-policy', passed: false },
          { type: 'score', description: 'quality-score', passed: true },
        ],
      }),
    ];

    const comparison = compareWithBaseline(currentResults, baseline);

    expect(comparison.hasRegressions).toBe(true);
    expect(comparison.summary.improved).toBe(1);
    expect(comparison.summary.regressed).toBe(1);
  });

  it('handles new assertions added to existing test', () => {
    const baseline: BaselineFile = {
      version: 1,
      savedAt: '2026-01-01T00:00:00Z',
      results: {
        'test-refund.yaml': {
          score: 100,
          assertions: { 'keyword-refund': true },
        },
      },
    };

    const currentResults = [
      makeResult({
        assertions: [
          { type: 'keyword', description: 'keyword-refund', passed: true },
          { type: 'score', description: 'new-assertion', passed: true },
        ],
      }),
    ];

    const comparison = compareWithBaseline(currentResults, baseline);

    const test = comparison.tests[0];
    const newAssertion = test.assertions.find((a) => a.name === 'new-assertion');
    expect(newAssertion).toBeDefined();
    expect(newAssertion!.status).toBe('added');
    expect(newAssertion!.before).toBeNull();
    expect(newAssertion!.after).toBe(true);
  });

  it('handles assertion removed from existing test', () => {
    const baseline: BaselineFile = {
      version: 1,
      savedAt: '2026-01-01T00:00:00Z',
      results: {
        'test-refund.yaml': {
          score: 50,
          assertions: {
            'keyword-refund': true,
            'old-assertion': false,
          },
        },
      },
    };

    const currentResults = [
      makeResult({
        assertions: [
          { type: 'keyword', description: 'keyword-refund', passed: true },
        ],
      }),
    ];

    const comparison = compareWithBaseline(currentResults, baseline);

    const test = comparison.tests[0];
    const removedAssertion = test.assertions.find(
      (a) => a.name === 'old-assertion',
    );
    expect(removedAssertion).toBeDefined();
    expect(removedAssertion!.status).toBe('removed');
    expect(removedAssertion!.before).toBe(false);
    expect(removedAssertion!.after).toBeNull();
  });

  it('returns hasRegressions=false for empty comparison', () => {
    const baseline: BaselineFile = {
      version: 1,
      savedAt: '2026-01-01T00:00:00Z',
      results: {},
    };

    const comparison = compareWithBaseline([], baseline);
    expect(comparison.hasRegressions).toBe(false);
    expect(comparison.tests).toHaveLength(0);
  });

  it('correctly computes score deltas', () => {
    const baseline: BaselineFile = {
      version: 1,
      savedAt: '2026-01-01T00:00:00Z',
      results: {
        'test-refund.yaml': {
          score: 50,
          assertions: {
            a: true,
            b: false,
          },
        },
      },
    };

    // Both now pass -> score 100
    const currentResults = [
      makeResult({
        assertions: [
          { type: 'keyword', description: 'a', passed: true },
          { type: 'keyword', description: 'b', passed: true },
        ],
      }),
    ];

    const comparison = compareWithBaseline(currentResults, baseline);
    const test = comparison.tests[0];
    expect(test.scoreBefore).toBe(50);
    expect(test.scoreAfter).toBe(100);
    expect(test.scoreDelta).toBe(50);
  });
});
