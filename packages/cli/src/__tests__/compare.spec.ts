import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  extractMetrics,
  determineWinner,
  formatComparisonTable,
  validateCompareOptions,
  type ComparisonMetrics,
  type ComparisonResult,
} from '../commands/compare';

// ── extractMetrics ─────────────────────────────────────────────────────────────

describe('extractMetrics', () => {
  it('returns all nulls for null execution', () => {
    const m = extractMetrics(null);
    expect(m.overallScore).toBeNull();
    expect(m.avgLatency).toBeNull();
    expect(m.turns).toBeNull();
    expect(m.duration).toBeNull();
  });

  it('returns all nulls for empty execution', () => {
    const m = extractMetrics({});
    expect(m.overallScore).toBeNull();
    expect(m.avgLatency).toBeNull();
    expect(m.turns).toBeNull();
    expect(m.duration).toBeNull();
  });

  it('extracts overallScore, rounding to integer', () => {
    const m = extractMetrics({ overallScore: 72.6 });
    expect(m.overallScore).toBe(73);
  });

  it('extracts duration', () => {
    const m = extractMetrics({ duration: 18000 });
    expect(m.duration).toBe(18000);
  });

  it('extracts latency and turns from stepResults', () => {
    const m = extractMetrics({
      stepResults: [
        { stepId: 'turn-0-agent', duration: 2000, actualResponse: 'hi' },
        { stepId: 'turn-0-persona', duration: 0, actualResponse: 'hey' },
        { stepId: 'turn-1-agent', duration: 3000, actualResponse: 'ok' },
        { stepId: 'turn-1-persona', duration: 0, actualResponse: 'bye' },
        { stepId: 'turn-2-agent', duration: 1000, actualResponse: 'done' },
      ],
    });
    expect(m.turns).toBe(3);
    expect(m.avgLatency).toBe(2000); // (2000+3000+1000)/3 = 2000
  });

  it('ignores agent steps with 0 duration', () => {
    const m = extractMetrics({
      stepResults: [
        { stepId: 'turn-0-agent', duration: 0, actualResponse: 'hi' },
        { stepId: 'turn-1-agent', duration: 1500, actualResponse: 'ok' },
      ],
    });
    expect(m.turns).toBe(1);
    expect(m.avgLatency).toBe(1500);
  });

  it('returns null latency/turns when no agent steps have duration', () => {
    const m = extractMetrics({
      stepResults: [
        { stepId: 'turn-0-persona', duration: 500, actualResponse: 'hi' },
      ],
    });
    expect(m.turns).toBeNull();
    expect(m.avgLatency).toBeNull();
  });

  it('extracts a full execution with all fields', () => {
    const m = extractMetrics({
      overallScore: 85,
      duration: 14000,
      stepResults: [
        { stepId: 'turn-0-agent', duration: 1800, actualResponse: 'hello' },
        { stepId: 'turn-0-persona', duration: 0, actualResponse: 'hi' },
        { stepId: 'turn-1-agent', duration: 2200, actualResponse: 'sure' },
        { stepId: 'turn-1-persona', duration: 0, actualResponse: 'thanks' },
      ],
    });
    expect(m.overallScore).toBe(85);
    expect(m.duration).toBe(14000);
    expect(m.turns).toBe(2);
    expect(m.avgLatency).toBe(2000);
  });
});

// ── determineWinner ────────────────────────────────────────────────────────────

describe('determineWinner', () => {
  const makeMetrics = (
    overrides: Partial<ComparisonMetrics> = {},
  ): ComparisonMetrics => ({
    overallScore: null,
    avgLatency: null,
    turns: null,
    duration: null,
    ...overrides,
  });

  it('returns null winner when both have no score', () => {
    const result = determineWinner(makeMetrics(), makeMetrics());
    expect(result.winner).toBeNull();
    expect(result.reason).toContain('no score');
  });

  it('A wins when only A has a score', () => {
    const result = determineWinner(
      makeMetrics({ overallScore: 80 }),
      makeMetrics(),
    );
    expect(result.winner).toBe('A');
    expect(result.reason).toContain('Only Model A');
  });

  it('B wins when only B has a score', () => {
    const result = determineWinner(
      makeMetrics(),
      makeMetrics({ overallScore: 75 }),
    );
    expect(result.winner).toBe('B');
    expect(result.reason).toContain('Only Model B');
  });

  it('A wins with higher score', () => {
    const result = determineWinner(
      makeMetrics({ overallScore: 90 }),
      makeMetrics({ overallScore: 70 }),
    );
    expect(result.winner).toBe('A');
    expect(result.reason).toContain('higher score');
    expect(result.reason).toContain('90');
    expect(result.reason).toContain('70');
  });

  it('B wins with higher score', () => {
    const result = determineWinner(
      makeMetrics({ overallScore: 70 }),
      makeMetrics({ overallScore: 90 }),
    );
    expect(result.winner).toBe('B');
    expect(result.reason).toContain('higher score');
  });

  it('tied score, A wins on faster latency', () => {
    const result = determineWinner(
      makeMetrics({ overallScore: 80, avgLatency: 1000 }),
      makeMetrics({ overallScore: 80, avgLatency: 2000 }),
    );
    expect(result.winner).toBe('A');
    expect(result.reason).toContain('faster');
  });

  it('tied score, B wins on faster latency', () => {
    const result = determineWinner(
      makeMetrics({ overallScore: 80, avgLatency: 3000 }),
      makeMetrics({ overallScore: 80, avgLatency: 1500 }),
    );
    expect(result.winner).toBe('B');
    expect(result.reason).toContain('faster');
  });

  it('tied score and latency, A wins on fewer turns', () => {
    const result = determineWinner(
      makeMetrics({ overallScore: 80, avgLatency: 2000, turns: 4 }),
      makeMetrics({ overallScore: 80, avgLatency: 2000, turns: 8 }),
    );
    expect(result.winner).toBe('A');
    expect(result.reason).toContain('fewer turns');
  });

  it('tied score and latency, B wins on fewer turns', () => {
    const result = determineWinner(
      makeMetrics({ overallScore: 80, avgLatency: 2000, turns: 10 }),
      makeMetrics({ overallScore: 80, avgLatency: 2000, turns: 6 }),
    );
    expect(result.winner).toBe('B');
    expect(result.reason).toContain('fewer turns');
  });

  it('completely identical metrics result in tie', () => {
    const result = determineWinner(
      makeMetrics({ overallScore: 80, avgLatency: 2000, turns: 6 }),
      makeMetrics({ overallScore: 80, avgLatency: 2000, turns: 6 }),
    );
    expect(result.winner).toBe('tie');
    expect(result.reason).toContain('identical');
  });

  it('tied scores with null latency fall through to turns', () => {
    const result = determineWinner(
      makeMetrics({ overallScore: 80, turns: 3 }),
      makeMetrics({ overallScore: 80, turns: 7 }),
    );
    expect(result.winner).toBe('A');
    expect(result.reason).toContain('fewer turns');
  });
});

// ── validateCompareOptions ─────────────────────────────────────────────────────

describe('validateCompareOptions', () => {
  it('returns error when scenario is missing', () => {
    const err = validateCompareOptions({ agentA: 'a.yaml', agentB: 'b.yaml' });
    expect(err).toContain('--scenario');
  });

  it('returns error when mixing agent and model flags', () => {
    const err = validateCompareOptions({
      scenario: 'test',
      agentA: 'a.yaml',
      modelB: 'gpt-4o',
    });
    expect(err).toContain('Cannot mix');
  });

  it('returns error when neither agents nor models are specified', () => {
    const err = validateCompareOptions({ scenario: 'test' });
    expect(err).toContain('Specify either');
  });

  it('returns error when only agentA is provided', () => {
    const err = validateCompareOptions({
      scenario: 'test',
      agentA: 'a.yaml',
    });
    expect(err).toContain('Both --agent-a and --agent-b');
  });

  it('returns error when only agentB is provided', () => {
    const err = validateCompareOptions({
      scenario: 'test',
      agentB: 'b.yaml',
    });
    expect(err).toContain('Both --agent-a and --agent-b');
  });

  it('returns error when only modelA is provided', () => {
    const err = validateCompareOptions({
      scenario: 'test',
      modelA: 'gpt-4o',
    });
    expect(err).toContain('Both --model-a and --model-b');
  });

  it('returns error when only modelB is provided', () => {
    const err = validateCompareOptions({
      scenario: 'test',
      modelB: 'gpt-4o',
    });
    expect(err).toContain('Both --model-a and --model-b');
  });

  it('returns null for valid agent pair', () => {
    const err = validateCompareOptions({
      scenario: 'test',
      agentA: 'a.yaml',
      agentB: 'b.yaml',
    });
    expect(err).toBeNull();
  });

  it('returns null for valid model pair', () => {
    const err = validateCompareOptions({
      scenario: 'test',
      modelA: 'gpt-4o',
      modelB: 'claude-sonnet-4-20250514',
    });
    expect(err).toBeNull();
  });
});

// ── formatComparisonTable ──────────────────────────────────────────────────────

describe('formatComparisonTable', () => {
  const makeResult = (
    overrides: Partial<ComparisonResult> = {},
  ): ComparisonResult => ({
    scenario: 'angry-customer-refund',
    sideA: {
      label: 'Support Bot v1',
      model: 'gpt-4o',
      execution: null,
      metrics: {
        overallScore: 72,
        avgLatency: 2300,
        turns: 8,
        duration: 18000,
      },
      error: null,
    },
    sideB: {
      label: 'Support Bot v2',
      model: 'claude-sonnet-4-20250514',
      execution: null,
      metrics: {
        overallScore: 85,
        avgLatency: 1800,
        turns: 6,
        duration: 14000,
      },
      error: null,
    },
    winner: 'B',
    winnerReason: 'higher score (85 vs 72)',
    ...overrides,
  });

  it('includes scenario name in output', () => {
    const output = formatComparisonTable(makeResult());
    // Strip ANSI for assertion
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('angry-customer-refund');
  });

  it('includes both model labels', () => {
    const output = formatComparisonTable(makeResult());
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('Support Bot v1');
    expect(plain).toContain('Support Bot v2');
  });

  it('includes metric values', () => {
    const output = formatComparisonTable(makeResult());
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('72/100');
    expect(plain).toContain('85/100');
  });

  it('includes star marker on winning values', () => {
    const output = formatComparisonTable(makeResult());
    // The star character (U+2605) should appear
    expect(output).toContain('\u2605');
  });

  it('includes winner line', () => {
    const output = formatComparisonTable(makeResult());
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('Winner');
    expect(plain).toContain('Model B');
    expect(plain).toContain('higher score');
  });

  it('shows tie message when tied', () => {
    const output = formatComparisonTable(
      makeResult({ winner: 'tie', winnerReason: 'identical metrics' }),
    );
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('Tie');
    expect(plain).toContain('identical metrics');
  });

  it('shows error messages when a side fails', () => {
    const result = makeResult();
    result.sideA.error = 'Connection refused';
    const output = formatComparisonTable(result);
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('Model A failed');
    expect(plain).toContain('Connection refused');
  });

  it('shows json hint at the bottom', () => {
    const output = formatComparisonTable(makeResult());
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('--json');
  });

  it('handles null metrics gracefully (shows n/a)', () => {
    const result = makeResult();
    result.sideA.metrics = {
      overallScore: null,
      avgLatency: null,
      turns: null,
      duration: null,
    };
    result.sideB.metrics = {
      overallScore: 85,
      avgLatency: 1800,
      turns: 6,
      duration: 14000,
    };
    const output = formatComparisonTable(result);
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('n/a');
    expect(plain).toContain('85/100');
  });

  it('hides rows where both sides are null', () => {
    const result = makeResult();
    result.sideA.metrics = {
      overallScore: 80,
      avgLatency: null,
      turns: null,
      duration: null,
    };
    result.sideB.metrics = {
      overallScore: 75,
      avgLatency: null,
      turns: null,
      duration: null,
    };
    const output = formatComparisonTable(result);
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    // Should have score row but not latency/turns/duration rows
    expect(plain).toContain('Overall Score');
    expect(plain).not.toContain('Avg Latency');
    expect(plain).not.toContain('Turns');
    expect(plain).not.toContain('Duration');
  });
});

// ── Command registration ───────────────────────────────────────────────────────

// Mock axios globally before any imports
jest.mock('axios', () => {
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };

  const mockAxios: any = {
    create: jest.fn(() => mockAxiosInstance),
    isAxiosError: jest.fn().mockReturnValue(false),
    __mockInstance: mockAxiosInstance,
  };

  return {
    __esModule: true,
    default: mockAxios,
  };
});

jest.mock('ora', () => {
  const spinner = {
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    warn: jest.fn().mockReturnThis(),
    text: '',
  };
  return {
    __esModule: true,
    default: jest.fn(() => spinner),
  };
});

describe('compare command registration', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chanl-cli-compare-test-'));
    originalEnv = process.env.CHANL_CONFIG_DIR;
    process.env.CHANL_CONFIG_DIR = tmpDir;

    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({
        server: 'http://localhost:18005/api/v1',
        apiKey: 'test-key',
        openaiApiKey: 'sk-test',
        anthropicApiKey: 'sk-ant-test',
      }),
    );

    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CHANL_CONFIG_DIR = originalEnv;
    } else {
      delete process.env.CHANL_CONFIG_DIR;
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  function createFreshProgram() {
    for (const key of Object.keys(require.cache)) {
      if (key.includes('chanl-eval/packages/cli/src/')) {
        delete require.cache[key];
      }
    }
    const { createProgram } = require('../index') as typeof import('../index');
    return createProgram();
  }

  it('registers the compare command on the program', () => {
    const program = createFreshProgram();
    const compare = program.commands.find(
      (c: any) => c.name() === 'compare',
    );
    expect(compare).toBeDefined();
    expect(compare!.description()).toContain('compare');
  });

  it('shows validation error when no model or agent flags are given', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    const program = createFreshProgram();

    // Commander will throw on missing required option --scenario
    try {
      await program.parseAsync([
        'node',
        'chanl',
        'compare',
        '--scenario',
        'test-scenario',
      ]);
    } catch {
      // Expected: validation error sets process.exitCode
    }

    const allErrors = errorSpy.mock.calls
      .map((c) => String(c[0]))
      .join(' ');
    // The error should mention specifying agents or models
    expect(allErrors).toContain('Specify either');

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
