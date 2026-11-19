/**
 * Run-set maths, kept free of Nest and Mongo so the numbers the room sees are testable on their own.
 */

export interface RunCheckResult {
  criteriaKey: string;
  criteriaName?: string;
  passed: boolean;
  reasoning?: string;
  evidence?: string[];
  notApplicable?: boolean;
  needsReview?: boolean;
}

/** One execution in a run set, with its newest scorecard result if it was scored. */
export interface RunInput {
  executionId: string;
  personaId: string;
  status: string;
  errorMessage?: string;
  result?: { passed?: boolean; criteriaResults?: RunCheckResult[] } | null;
}

export interface FailedCheck {
  key: string;
  name: string;
  reasoning: string;
  evidence: string[];
  needsReview?: boolean;
}

export interface RunSummary {
  executionId: string;
  personaId: string;
  status: string;
  /** null while the run is still queued or running. */
  passed: boolean | null;
  failedChecks: FailedCheck[];
}

export type RunSetLabel = 'Reliable' | 'Flaky' | 'Broken';
export type PersonaVerdict = 'Held' | 'Broken' | 'Needs review';

export interface PersonaSummary {
  personaId: string;
  personaName: string;
  runs: number;
  passed: number;
  /** null until at least one of the persona's runs has finished. */
  verdict: PersonaVerdict | null;
  evidence: string | null;
}

export interface RunSetSummary {
  status: 'running' | 'completed';
  total: number;
  completed: number;
  passed: number;
  passK: boolean;
  passAtK: boolean;
  label: RunSetLabel | null;
  mostFailedCheck: { key: string; name: string; failed: number } | null;
  runs: RunSummary[];
  byPersona: PersonaSummary[];
}

const DONE = new Set(['completed', 'failed', 'timeout', 'cancelled']);

export function summarizeRun(run: RunInput): RunSummary {
  const done = DONE.has(run.status);
  const failedChecks: FailedCheck[] = (run.result?.criteriaResults || [])
    .filter((c) => !c.passed && !c.notApplicable)
    .map((c) => ({
      key: c.criteriaKey,
      name: c.criteriaName || c.criteriaKey,
      reasoning: c.reasoning || '',
      evidence: c.evidence || [],
      ...(c.needsReview ? { needsReview: true } : {}),
    }));
  // A run that finished without a scorecard result (errored, or scoring failed) did not pass.
  const passed = done ? run.status === 'completed' && run.result?.passed === true : null;
  return {
    executionId: run.executionId,
    personaId: run.personaId,
    status: run.status,
    passed,
    failedChecks,
  };
}

export function summarizeRunSet(
  personaIds: string[],
  runsIn: RunInput[],
  personaNames: Record<string, string> = {},
): RunSetSummary {
  const runs = runsIn.map(summarizeRun);
  const total = runs.length;
  const finished = runs.filter((r) => r.passed !== null);
  const completed = finished.length;
  const passed = runs.filter((r) => r.passed === true).length;
  const allDone = total > 0 && completed === total;

  const failCounts = new Map<string, { key: string; name: string; failed: number }>();
  for (const run of runs) {
    for (const check of run.failedChecks) {
      const entry = failCounts.get(check.key) || { key: check.key, name: check.name, failed: 0 };
      entry.failed++;
      failCounts.set(check.key, entry);
    }
  }
  const mostFailedCheck =
    [...failCounts.values()].sort((a, b) => b.failed - a.failed)[0] || null;

  const byPersona = personaIds.map((personaId) => {
    const own = runs.filter((r) => r.personaId === personaId);
    const ownInputs = runsIn.filter((r) => r.personaId === personaId);
    return summarizePersona(personaId, personaNames[personaId] || personaId, own, ownInputs);
  });

  return {
    status: allDone ? 'completed' : 'running',
    total,
    completed,
    passed,
    passK: allDone && passed === total,
    passAtK: passed > 0,
    label: allDone ? (passed === total ? 'Reliable' : passed === 0 ? 'Broken' : 'Flaky') : null,
    mostFailedCheck,
    runs,
    byPersona,
  };
}

/**
 * Held: every finished run passed. Broken: some run failed a check outright, with that check's
 * evidence. Needs review: the only failures are verdicts a person has to confirm (a judge with no
 * quote) or runs that errored before they could be scored.
 */
function summarizePersona(
  personaId: string,
  personaName: string,
  runs: RunSummary[],
  inputs: RunInput[],
): PersonaSummary {
  const finished = runs.filter((r) => r.passed !== null);
  const passed = runs.filter((r) => r.passed === true).length;
  const base = { personaId, personaName, runs: runs.length, passed };
  if (finished.length === 0) return { ...base, verdict: null, evidence: null };

  const failing = finished.filter((r) => r.passed === false);
  if (failing.length === 0) return { ...base, verdict: 'Held', evidence: null };

  for (const run of failing) {
    const hard = run.failedChecks.find((c) => !c.needsReview);
    if (hard) {
      return { ...base, verdict: 'Broken', evidence: describeFailure(hard) };
    }
  }

  const review = failing.flatMap((r) => r.failedChecks).find((c) => c.needsReview);
  if (review) return { ...base, verdict: 'Needs review', evidence: describeFailure(review) };

  const errored = inputs.find((i) => i.executionId === failing[0].executionId);
  return {
    ...base,
    verdict: 'Needs review',
    evidence: errored?.errorMessage
      ? `Run ${errored.status}: ${errored.errorMessage}`
      : `Run ${failing[0].status} without a passing score`,
  };
}

function describeFailure(check: FailedCheck): string {
  const detail = check.evidence.find((e) => e && e.trim()) || check.reasoning;
  return `${check.name}: ${detail}`;
}

export interface CompareSide {
  k: number;
  runs: RunInput[];
}

export interface RunSetComparison {
  before: { passed: number; k: number; passK: boolean };
  after: { passed: number; k: number; passK: boolean };
  checks: Array<{
    key: string;
    name: string;
    beforeFailed: number;
    afterFailed: number;
    change: 'improved' | 'regressed' | 'same';
  }>;
}

/**
 * Per-check failure counts before and after. The change compares failure rates, so a baseline
 * with a different number of runs still compares fairly.
 */
export function compareRunSets(before: CompareSide, after: CompareSide): RunSetComparison {
  const b = summarizeRunSet([], before.runs);
  const a = summarizeRunSet([], after.runs);

  const names = new Map<string, string>();
  for (const run of [...before.runs, ...after.runs]) {
    for (const c of run.result?.criteriaResults || []) {
      if (!names.has(c.criteriaKey)) names.set(c.criteriaKey, c.criteriaName || c.criteriaKey);
    }
  }
  const failedCount = (runs: RunSummary[], key: string) =>
    runs.filter((r) => r.failedChecks.some((c) => c.key === key)).length;
  const rate = (n: number, of: number) => (of > 0 ? n / of : 0);

  const checks = [...names.entries()].map(([key, name]) => {
    const beforeFailed = failedCount(b.runs, key);
    const afterFailed = failedCount(a.runs, key);
    const beforeRate = rate(beforeFailed, b.completed);
    const afterRate = rate(afterFailed, a.completed);
    const change: 'improved' | 'regressed' | 'same' =
      afterRate < beforeRate ? 'improved' : afterRate > beforeRate ? 'regressed' : 'same';
    return { key, name, beforeFailed, afterFailed, change };
  });

  return {
    before: { passed: b.passed, k: before.k, passK: b.passK },
    after: { passed: a.passed, k: after.k, passK: a.passK },
    checks,
  };
}
