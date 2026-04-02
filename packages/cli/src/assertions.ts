/**
 * Assertion engine for `chanl test` — evaluates pass/fail assertions
 * against scenario execution results.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface KeywordAssertion {
  type: 'keyword';
  must_include?: string[];
  must_not_include?: string[];
  description?: string;
}

export interface ResponseTimeAssertion {
  type: 'response_time';
  max_seconds: number;
  description?: string;
}

export interface PromptAssertion {
  type: 'prompt';
  rubric: string;
  min_score: number;
  description?: string;
}

export interface ToolCallAssertion {
  type: 'tool_call';
  expected: string[];
  description?: string;
}

export interface ScoreAssertion {
  type: 'score';
  min_score: number;
  description?: string;
}

export type Assertion =
  | KeywordAssertion
  | ResponseTimeAssertion
  | PromptAssertion
  | ToolCallAssertion
  | ScoreAssertion;

export interface AssertionResult {
  type: string;
  description: string;
  passed: boolean;
  actual: string;
  expected: string;
  reason: string;
}

/** Shape of a parsed test YAML file. */
export interface TestDefinition {
  scenario: string;
  /** Prompt entity ID — defines the agent under test */
  promptId?: string;
  /** @deprecated Use promptId instead. Kept for backwards compat parsing. */
  agent?: string;
  assertions: Assertion[];
}

/* ------------------------------------------------------------------ */
/* Transcript helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Extract the full transcript text from an execution's stepResults.
 * Concatenates all actualResponse fields.
 */
export function extractTranscriptText(execution: any): string {
  if (!execution.stepResults || !Array.isArray(execution.stepResults)) {
    return '';
  }
  return execution.stepResults
    .map((step: any) => step.actualResponse || '')
    .filter(Boolean)
    .join('\n');
}

/**
 * Extract average agent response time in seconds from execution data.
 * Checks execution.metrics first, then computes from stepResults durations.
 */
export function extractAvgResponseTimeSecs(execution: any): number | null {
  // Check for pre-computed latency in metrics
  if (execution.metrics?.avgResponseTimeMs) {
    return execution.metrics.avgResponseTimeMs / 1000;
  }

  // Compute from stepResults agent durations
  if (execution.stepResults && Array.isArray(execution.stepResults)) {
    const agentSteps = execution.stepResults.filter(
      (s: any) =>
        typeof s.stepId === 'string' &&
        s.stepId.includes('agent') &&
        s.duration > 0,
    );
    if (agentSteps.length > 0) {
      const total = agentSteps.reduce(
        (sum: number, s: any) => sum + s.duration,
        0,
      );
      return total / agentSteps.length / 1000;
    }
  }

  // Fall back to overall duration if available
  if (execution.duration) {
    return execution.duration / 1000;
  }

  return null;
}

/**
 * Extract tool names mentioned in an execution.
 * Checks stepResults metadata and falls back to transcript keyword search.
 */
export function extractToolCalls(execution: any): string[] {
  const tools = new Set<string>();

  if (execution.stepResults && Array.isArray(execution.stepResults)) {
    for (const step of execution.stepResults) {
      // Check step metadata for tool call info
      if (step.toolCalls && Array.isArray(step.toolCalls)) {
        for (const tc of step.toolCalls) {
          if (tc.name) tools.add(tc.name);
        }
      }
      if (step.metadata?.toolCalls && Array.isArray(step.metadata.toolCalls)) {
        for (const tc of step.metadata.toolCalls) {
          if (tc.name) tools.add(tc.name);
        }
      }
    }
  }

  // Check execution-level metrics
  if (execution.metrics?.toolCalls && Array.isArray(execution.metrics.toolCalls)) {
    for (const tc of execution.metrics.toolCalls) {
      if (typeof tc === 'string') tools.add(tc);
      else if (tc.name) tools.add(tc.name);
    }
  }

  return Array.from(tools);
}

/**
 * Extract the overall score from an execution, if present.
 */
export function extractOverallScore(execution: any): number | null {
  if (typeof execution.overallScore === 'number') {
    return execution.overallScore;
  }
  if (typeof execution.metadata?.scorecardResult?.overallScore === 'number') {
    return execution.metadata.scorecardResult.overallScore;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Assertion evaluators                                                */
/* ------------------------------------------------------------------ */

function evaluateKeyword(assertion: KeywordAssertion, execution: any): AssertionResult {
  const transcript = extractTranscriptText(execution).toLowerCase();
  const description = assertion.description || 'Keyword check';

  if (assertion.must_include && assertion.must_include.length > 0) {
    const missing = assertion.must_include.filter(
      (kw) => !transcript.includes(kw.toLowerCase()),
    );
    if (missing.length > 0) {
      return {
        type: 'keyword',
        description,
        passed: false,
        actual: `missing: ${missing.join(', ')}`,
        expected: `must include: ${assertion.must_include.join(', ')}`,
        reason: `Keywords not found in transcript: ${missing.join(', ')}`,
      };
    }
  }

  if (assertion.must_not_include && assertion.must_not_include.length > 0) {
    const found = assertion.must_not_include.filter((kw) =>
      transcript.includes(kw.toLowerCase()),
    );
    if (found.length > 0) {
      return {
        type: 'keyword',
        description,
        passed: false,
        actual: `found: ${found.join(', ')}`,
        expected: `must not include: ${assertion.must_not_include.join(', ')}`,
        reason: `Forbidden keywords found in transcript: ${found.join(', ')}`,
      };
    }
  }

  return {
    type: 'keyword',
    description,
    passed: true,
    actual: 'all keywords matched',
    expected: formatKeywordExpected(assertion),
    reason: 'All keyword checks passed',
  };
}

function formatKeywordExpected(assertion: KeywordAssertion): string {
  const parts: string[] = [];
  if (assertion.must_include?.length) {
    parts.push(`include: ${assertion.must_include.join(', ')}`);
  }
  if (assertion.must_not_include?.length) {
    parts.push(`exclude: ${assertion.must_not_include.join(', ')}`);
  }
  return parts.join('; ');
}

function evaluateResponseTime(
  assertion: ResponseTimeAssertion,
  execution: any,
): AssertionResult {
  const description = assertion.description || 'Response time check';
  const actualSecs = extractAvgResponseTimeSecs(execution);

  if (actualSecs === null) {
    return {
      type: 'response_time',
      description,
      passed: false,
      actual: 'no timing data',
      expected: `<= ${assertion.max_seconds}s`,
      reason: 'No response time data available in execution results',
    };
  }

  const passed = actualSecs <= assertion.max_seconds;
  return {
    type: 'response_time',
    description,
    passed,
    actual: `${actualSecs.toFixed(2)}s`,
    expected: `<= ${assertion.max_seconds}s`,
    reason: passed
      ? `Response time ${actualSecs.toFixed(2)}s within limit`
      : `Response time ${actualSecs.toFixed(2)}s exceeds ${assertion.max_seconds}s limit`,
  };
}

function evaluatePrompt(
  assertion: PromptAssertion,
  execution: any,
): AssertionResult {
  const description = assertion.description || 'Prompt-based check';
  const score = extractOverallScore(execution);

  if (score === null) {
    return {
      type: 'prompt',
      description,
      passed: false,
      actual: 'no scorecard score',
      expected: `>= ${assertion.min_score}/10`,
      reason:
        'No scorecard score available. Ensure the scenario has a scorecard configured.',
    };
  }

  // Normalize: if score is 0-100, scale to 0-10 for comparison
  const normalizedScore = score > 10 ? score / 10 : score;
  const passed = normalizedScore >= assertion.min_score;

  return {
    type: 'prompt',
    description,
    passed,
    actual: `${normalizedScore.toFixed(1)}/10`,
    expected: `>= ${assertion.min_score}/10`,
    reason: passed
      ? `Score ${normalizedScore.toFixed(1)} meets minimum ${assertion.min_score}`
      : `Score ${normalizedScore.toFixed(1)} below minimum ${assertion.min_score}`,
  };
}

function evaluateToolCall(
  assertion: ToolCallAssertion,
  execution: any,
): AssertionResult {
  const description = assertion.description || 'Tool call check';
  const actualTools = extractToolCalls(execution);

  // If no tools found via structured data, fall back to transcript search
  let effectiveTools = actualTools;
  if (actualTools.length === 0) {
    const transcript = extractTranscriptText(execution).toLowerCase();
    effectiveTools = assertion.expected.filter((tool) =>
      transcript.includes(tool.toLowerCase()),
    );
  }

  const missing = assertion.expected.filter(
    (tool) =>
      !effectiveTools.some(
        (actual) => actual.toLowerCase() === tool.toLowerCase(),
      ),
  );

  const passed = missing.length === 0;
  return {
    type: 'tool_call',
    description,
    passed,
    actual: effectiveTools.length > 0 ? effectiveTools.join(', ') : 'none',
    expected: assertion.expected.join(', '),
    reason: passed
      ? `All expected tools were called: ${assertion.expected.join(', ')}`
      : `Missing tool calls: ${missing.join(', ')}`,
  };
}

function evaluateScore(
  assertion: ScoreAssertion,
  execution: any,
): AssertionResult {
  const description = assertion.description || 'Score check';
  const score = extractOverallScore(execution);

  if (score === null) {
    return {
      type: 'score',
      description,
      passed: false,
      actual: 'no score',
      expected: `>= ${assertion.min_score}`,
      reason: 'No overall score available in execution results',
    };
  }

  const passed = score >= assertion.min_score;
  return {
    type: 'score',
    description,
    passed,
    actual: String(score),
    expected: `>= ${assertion.min_score}`,
    reason: passed
      ? `Score ${score} meets minimum ${assertion.min_score}`
      : `Score ${score} below minimum ${assertion.min_score}`,
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Evaluate all assertions against an execution result.
 */
export function evaluateAssertions(
  assertions: Assertion[],
  execution: any,
): AssertionResult[] {
  return assertions.map((assertion) => {
    switch (assertion.type) {
      case 'keyword':
        return evaluateKeyword(assertion as KeywordAssertion, execution);
      case 'response_time':
        return evaluateResponseTime(
          assertion as ResponseTimeAssertion,
          execution,
        );
      case 'prompt':
        return evaluatePrompt(assertion as PromptAssertion, execution);
      case 'tool_call':
        return evaluateToolCall(assertion as ToolCallAssertion, execution);
      case 'score':
        return evaluateScore(assertion as ScoreAssertion, execution);
      default:
        return {
          type: (assertion as any).type || 'unknown',
          description:
            (assertion as any).description || 'Unknown assertion type',
          passed: false,
          actual: 'N/A',
          expected: 'N/A',
          reason: `Unknown assertion type: ${(assertion as any).type}`,
        };
    }
  });
}
