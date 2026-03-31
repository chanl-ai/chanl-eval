import {
  evaluateAssertions,
  extractTranscriptText,
  extractAvgResponseTimeSecs,
  extractToolCalls,
  extractOverallScore,
  type Assertion,
  type AssertionResult,
} from '../assertions';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeExecution(overrides: Record<string, any> = {}): any {
  return {
    status: 'completed',
    duration: 8000,
    overallScore: 75,
    stepResults: [
      {
        stepId: 'turn-0-persona',
        actualResponse: 'I want a refund for my broken laptop.',
        duration: 0,
      },
      {
        stepId: 'turn-0-agent',
        actualResponse:
          'I understand your frustration. Let me check your order and our refund policy for you.',
        duration: 1200,
        toolCalls: [{ name: 'check_order' }],
      },
      {
        stepId: 'turn-1-persona',
        actualResponse: 'This is unacceptable!',
        duration: 0,
      },
      {
        stepId: 'turn-1-agent',
        actualResponse:
          'I apologize for the inconvenience. Based on our policy, you are eligible for a full refund.',
        duration: 900,
        toolCalls: [{ name: 'process_refund' }],
      },
    ],
    metrics: {
      totalSteps: 4,
      completedSteps: 4,
      failedSteps: 0,
    },
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* extractTranscriptText                                               */
/* ------------------------------------------------------------------ */

describe('extractTranscriptText', () => {
  it('concatenates all actualResponse fields', () => {
    const exec = makeExecution();
    const text = extractTranscriptText(exec);
    expect(text).toContain('refund for my broken laptop');
    expect(text).toContain('refund policy');
    expect(text).toContain('eligible for a full refund');
  });

  it('returns empty string when no stepResults', () => {
    expect(extractTranscriptText({})).toBe('');
    expect(extractTranscriptText({ stepResults: [] })).toBe('');
  });

  it('skips steps with no actualResponse', () => {
    const exec = makeExecution({
      stepResults: [
        { stepId: 'turn-0-agent', actualResponse: 'Hello' },
        { stepId: 'turn-1-agent' }, // missing actualResponse
        { stepId: 'turn-2-agent', actualResponse: 'Goodbye' },
      ],
    });
    const text = extractTranscriptText(exec);
    expect(text).toBe('Hello\nGoodbye');
  });
});

/* ------------------------------------------------------------------ */
/* extractAvgResponseTimeSecs                                          */
/* ------------------------------------------------------------------ */

describe('extractAvgResponseTimeSecs', () => {
  it('computes average from agent step durations', () => {
    const exec = makeExecution();
    const avg = extractAvgResponseTimeSecs(exec);
    // Two agent steps: 1200ms and 900ms -> avg 1050ms -> 1.05s
    expect(avg).toBeCloseTo(1.05, 1);
  });

  it('uses metrics.avgResponseTimeMs if present', () => {
    const exec = makeExecution({
      metrics: { avgResponseTimeMs: 2000 },
    });
    const avg = extractAvgResponseTimeSecs(exec);
    expect(avg).toBe(2.0);
  });

  it('falls back to overall duration if no step timing', () => {
    const exec = makeExecution({
      stepResults: [{ stepId: 'turn-0-agent', actualResponse: 'Hi' }],
      duration: 5000,
    });
    const avg = extractAvgResponseTimeSecs(exec);
    expect(avg).toBe(5.0);
  });

  it('returns null when no timing data at all', () => {
    expect(extractAvgResponseTimeSecs({})).toBeNull();
    expect(extractAvgResponseTimeSecs({ stepResults: [] })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* extractToolCalls                                                    */
/* ------------------------------------------------------------------ */

describe('extractToolCalls', () => {
  it('extracts tool names from stepResults.toolCalls', () => {
    const exec = makeExecution();
    const tools = extractToolCalls(exec);
    expect(tools).toContain('check_order');
    expect(tools).toContain('process_refund');
  });

  it('extracts from step.metadata.toolCalls', () => {
    const exec = makeExecution({
      stepResults: [
        {
          stepId: 'turn-0-agent',
          actualResponse: 'Done',
          metadata: { toolCalls: [{ name: 'lookup_account' }] },
        },
      ],
    });
    const tools = extractToolCalls(exec);
    expect(tools).toContain('lookup_account');
  });

  it('extracts from execution.metrics.toolCalls', () => {
    const exec = makeExecution({
      stepResults: [],
      metrics: { toolCalls: [{ name: 'create_ticket' }, 'send_email'] },
    });
    const tools = extractToolCalls(exec);
    expect(tools).toContain('create_ticket');
    expect(tools).toContain('send_email');
  });

  it('deduplicates tool names', () => {
    const exec = makeExecution({
      stepResults: [
        {
          stepId: 'turn-0-agent',
          toolCalls: [{ name: 'check_order' }],
        },
        {
          stepId: 'turn-1-agent',
          toolCalls: [{ name: 'check_order' }],
        },
      ],
    });
    const tools = extractToolCalls(exec);
    expect(tools.filter((t) => t === 'check_order')).toHaveLength(1);
  });

  it('returns empty array when no tool call data', () => {
    expect(extractToolCalls({})).toEqual([]);
    expect(extractToolCalls({ stepResults: [] })).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* extractOverallScore                                                 */
/* ------------------------------------------------------------------ */

describe('extractOverallScore', () => {
  it('returns top-level overallScore', () => {
    expect(extractOverallScore({ overallScore: 85 })).toBe(85);
  });

  it('returns nested scorecardResult.overallScore', () => {
    expect(
      extractOverallScore({
        metadata: { scorecardResult: { overallScore: 60 } },
      }),
    ).toBe(60);
  });

  it('prefers top-level over nested', () => {
    expect(
      extractOverallScore({
        overallScore: 90,
        metadata: { scorecardResult: { overallScore: 60 } },
      }),
    ).toBe(90);
  });

  it('returns null when no score', () => {
    expect(extractOverallScore({})).toBeNull();
    expect(extractOverallScore({ metadata: {} })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Keyword assertion                                                   */
/* ------------------------------------------------------------------ */

describe('keyword assertion', () => {
  it('passes when all must_include keywords are in transcript', () => {
    const exec = makeExecution();
    const [result] = evaluateAssertions(
      [
        {
          type: 'keyword',
          must_include: ['refund', 'policy'],
          description: 'Agent mentions refund policy',
        },
      ],
      exec,
    );
    expect(result.passed).toBe(true);
    expect(result.type).toBe('keyword');
  });

  it('fails when a must_include keyword is missing', () => {
    const exec = makeExecution();
    const [result] = evaluateAssertions(
      [
        {
          type: 'keyword',
          must_include: ['refund', 'cryptocurrency'],
          description: 'Check keywords',
        },
      ],
      exec,
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('cryptocurrency');
  });

  it('is case-insensitive', () => {
    const exec = makeExecution();
    const [result] = evaluateAssertions(
      [
        {
          type: 'keyword',
          must_include: ['REFUND', 'POLICY'],
        },
      ],
      exec,
    );
    expect(result.passed).toBe(true);
  });

  it('passes when must_not_include keywords are absent', () => {
    const exec = makeExecution();
    const [result] = evaluateAssertions(
      [
        {
          type: 'keyword',
          must_not_include: ['lawsuit', 'attorney'],
          description: 'No legal threats',
        },
      ],
      exec,
    );
    expect(result.passed).toBe(true);
  });

  it('fails when must_not_include keyword is found', () => {
    const exec = makeExecution();
    const [result] = evaluateAssertions(
      [
        {
          type: 'keyword',
          must_not_include: ['refund'],
          description: 'Should not mention refund',
        },
      ],
      exec,
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('refund');
  });

  it('handles both must_include and must_not_include together', () => {
    const exec = makeExecution();
    const [result] = evaluateAssertions(
      [
        {
          type: 'keyword',
          must_include: ['refund'],
          must_not_include: ['lawsuit'],
        },
      ],
      exec,
    );
    expect(result.passed).toBe(true);
  });

  it('fails on must_not_include even when must_include passes', () => {
    const exec = makeExecution();
    const [result] = evaluateAssertions(
      [
        {
          type: 'keyword',
          must_include: ['refund'],
          must_not_include: ['policy'],
        },
      ],
      exec,
    );
    // must_include passes but must_not_include fails — overall fail
    expect(result.passed).toBe(false);
  });

  it('passes with empty transcript when both lists empty', () => {
    const [result] = evaluateAssertions(
      [{ type: 'keyword', must_include: [], must_not_include: [] }],
      {},
    );
    expect(result.passed).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Response time assertion                                             */
/* ------------------------------------------------------------------ */

describe('response_time assertion', () => {
  it('passes when avg response time is within limit', () => {
    const exec = makeExecution(); // avg ~1.05s
    const [result] = evaluateAssertions(
      [
        {
          type: 'response_time',
          max_seconds: 5,
          description: 'Agent responds within 5 seconds',
        },
      ],
      exec,
    );
    expect(result.passed).toBe(true);
    expect(result.actual).toContain('1.05');
  });

  it('fails when avg response time exceeds limit', () => {
    const exec = makeExecution(); // avg ~1.05s
    const [result] = evaluateAssertions(
      [
        {
          type: 'response_time',
          max_seconds: 0.5,
          description: 'Super fast',
        },
      ],
      exec,
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('exceeds');
  });

  it('passes at exact boundary', () => {
    const exec = makeExecution({
      metrics: { avgResponseTimeMs: 5000 },
    });
    const [result] = evaluateAssertions(
      [{ type: 'response_time', max_seconds: 5 }],
      exec,
    );
    expect(result.passed).toBe(true);
  });

  it('fails when no timing data available', () => {
    const [result] = evaluateAssertions(
      [{ type: 'response_time', max_seconds: 5 }],
      { stepResults: [] },
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('No response time data');
  });
});

/* ------------------------------------------------------------------ */
/* Prompt assertion                                                    */
/* ------------------------------------------------------------------ */

describe('prompt assertion', () => {
  it('passes when score meets min_score (0-100 scale normalized to 0-10)', () => {
    const exec = makeExecution({ overallScore: 80 }); // 80/100 = 8.0/10
    const [result] = evaluateAssertions(
      [
        {
          type: 'prompt',
          rubric: 'Agent de-escalated',
          min_score: 7,
          description: 'De-escalation check',
        },
      ],
      exec,
    );
    expect(result.passed).toBe(true);
    expect(result.actual).toContain('8.0');
  });

  it('fails when score is below min_score', () => {
    const exec = makeExecution({ overallScore: 50 }); // 50/100 = 5.0/10
    const [result] = evaluateAssertions(
      [
        {
          type: 'prompt',
          rubric: 'Agent de-escalated',
          min_score: 7,
          description: 'De-escalation check',
        },
      ],
      exec,
    );
    expect(result.passed).toBe(false);
    expect(result.actual).toContain('5.0');
  });

  it('handles scores already on 0-10 scale', () => {
    const exec = makeExecution({ overallScore: 8 }); // 8/10 — no normalization needed
    const [result] = evaluateAssertions(
      [{ type: 'prompt', rubric: 'test', min_score: 7 }],
      exec,
    );
    expect(result.passed).toBe(true);
    expect(result.actual).toContain('8.0');
  });

  it('fails when no score available', () => {
    const exec = makeExecution({ overallScore: undefined });
    delete exec.overallScore;
    const [result] = evaluateAssertions(
      [{ type: 'prompt', rubric: 'test', min_score: 5 }],
      exec,
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('No scorecard score');
  });
});

/* ------------------------------------------------------------------ */
/* Tool call assertion                                                 */
/* ------------------------------------------------------------------ */

describe('tool_call assertion', () => {
  it('passes when all expected tools were called', () => {
    const exec = makeExecution();
    const [result] = evaluateAssertions(
      [
        {
          type: 'tool_call',
          expected: ['check_order'],
          description: 'Agent checks order',
        },
      ],
      exec,
    );
    expect(result.passed).toBe(true);
  });

  it('passes when checking multiple tools', () => {
    const exec = makeExecution();
    const [result] = evaluateAssertions(
      [
        {
          type: 'tool_call',
          expected: ['check_order', 'process_refund'],
        },
      ],
      exec,
    );
    expect(result.passed).toBe(true);
  });

  it('fails when an expected tool was not called', () => {
    const exec = makeExecution();
    const [result] = evaluateAssertions(
      [
        {
          type: 'tool_call',
          expected: ['check_order', 'send_email'],
        },
      ],
      exec,
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('send_email');
  });

  it('is case-insensitive', () => {
    const exec = makeExecution();
    const [result] = evaluateAssertions(
      [{ type: 'tool_call', expected: ['CHECK_ORDER'] }],
      exec,
    );
    expect(result.passed).toBe(true);
  });

  it('falls back to transcript search when no structured tool data', () => {
    const exec = makeExecution({
      stepResults: [
        {
          stepId: 'turn-0-agent',
          actualResponse: 'I used the check_order tool to look up your order.',
          duration: 500,
          // No toolCalls field
        },
      ],
    });
    const [result] = evaluateAssertions(
      [{ type: 'tool_call', expected: ['check_order'] }],
      exec,
    );
    expect(result.passed).toBe(true);
  });

  it('fails when no tools found anywhere', () => {
    const exec = makeExecution({
      stepResults: [
        {
          stepId: 'turn-0-agent',
          actualResponse: 'Hello, how can I help?',
          duration: 500,
        },
      ],
    });
    const [result] = evaluateAssertions(
      [{ type: 'tool_call', expected: ['check_order'] }],
      exec,
    );
    expect(result.passed).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Score assertion                                                     */
/* ------------------------------------------------------------------ */

describe('score assertion', () => {
  it('passes when overall score meets minimum', () => {
    const exec = makeExecution({ overallScore: 75 });
    const [result] = evaluateAssertions(
      [
        {
          type: 'score',
          min_score: 70,
          description: 'Minimum quality score',
        },
      ],
      exec,
    );
    expect(result.passed).toBe(true);
    expect(result.actual).toBe('75');
  });

  it('passes at exact boundary', () => {
    const exec = makeExecution({ overallScore: 70 });
    const [result] = evaluateAssertions(
      [{ type: 'score', min_score: 70 }],
      exec,
    );
    expect(result.passed).toBe(true);
  });

  it('fails when score is below minimum', () => {
    const exec = makeExecution({ overallScore: 45 });
    const [result] = evaluateAssertions(
      [{ type: 'score', min_score: 70 }],
      exec,
    );
    expect(result.passed).toBe(false);
    expect(result.actual).toBe('45');
  });

  it('fails when no score data', () => {
    const [result] = evaluateAssertions([{ type: 'score', min_score: 50 }], {});
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('No overall score');
  });
});

/* ------------------------------------------------------------------ */
/* Unknown assertion type                                              */
/* ------------------------------------------------------------------ */

describe('unknown assertion type', () => {
  it('returns a failed result for unknown types', () => {
    const [result] = evaluateAssertions(
      [{ type: 'nonexistent' as any, description: 'bad assertion' }],
      makeExecution(),
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Unknown assertion type');
  });
});

/* ------------------------------------------------------------------ */
/* evaluateAssertions — multiple assertions                            */
/* ------------------------------------------------------------------ */

describe('evaluateAssertions (multiple)', () => {
  it('evaluates all assertions and returns results in order', () => {
    const exec = makeExecution();
    const assertions: Assertion[] = [
      {
        type: 'keyword',
        must_include: ['refund'],
        description: 'Mentions refund',
      },
      {
        type: 'response_time',
        max_seconds: 5,
        description: 'Fast response',
      },
      {
        type: 'tool_call',
        expected: ['check_order'],
        description: 'Checks order',
      },
      {
        type: 'score',
        min_score: 70,
        description: 'Quality score',
      },
    ];

    const results = evaluateAssertions(assertions, exec);

    expect(results).toHaveLength(4);
    expect(results[0].type).toBe('keyword');
    expect(results[0].passed).toBe(true);
    expect(results[1].type).toBe('response_time');
    expect(results[1].passed).toBe(true);
    expect(results[2].type).toBe('tool_call');
    expect(results[2].passed).toBe(true);
    expect(results[3].type).toBe('score');
    expect(results[3].passed).toBe(true);
  });

  it('mixed pass/fail results are preserved', () => {
    const exec = makeExecution({ overallScore: 40 });
    const assertions: Assertion[] = [
      { type: 'keyword', must_include: ['refund'] },
      { type: 'score', min_score: 70 },
    ];

    const results = evaluateAssertions(assertions, exec);

    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(false);
  });

  it('returns empty array for empty assertions', () => {
    const results = evaluateAssertions([], makeExecution());
    expect(results).toEqual([]);
  });
});
