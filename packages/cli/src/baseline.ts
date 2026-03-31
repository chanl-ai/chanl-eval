/**
 * Baseline management for `chanl test --save-baseline` / `--baseline`.
 *
 * Saves test results as a JSON snapshot and compares future runs
 * against the snapshot to detect regressions.
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface BaselineAssertionEntry {
  [assertionKey: string]: boolean;
}

export interface BaselineTestEntry {
  score: number | null;
  assertions: Record<string, boolean>;
}

export interface BaselineFile {
  version: 1;
  savedAt: string;
  results: Record<string, BaselineTestEntry>;
}

export type ComparisonStatus = 'improved' | 'regressed' | 'unchanged' | 'added' | 'removed';

export interface AssertionComparison {
  name: string;
  status: ComparisonStatus;
  before: boolean | null;
  after: boolean | null;
}

export interface TestComparison {
  file: string;
  status: ComparisonStatus;
  scoreBefore: number | null;
  scoreAfter: number | null;
  scoreDelta: number | null;
  assertions: AssertionComparison[];
}

export interface BaselineComparison {
  tests: TestComparison[];
  summary: {
    improved: number;
    regressed: number;
    unchanged: number;
    added: number;
    removed: number;
  };
  hasRegressions: boolean;
}

/* ------------------------------------------------------------------ */
/* Assertion key generation                                            */
/* ------------------------------------------------------------------ */

/**
 * Build a stable key for an assertion result.
 * Uses the description if available, otherwise falls back to type + index.
 */
export function assertionKey(
  result: { type: string; description?: string },
  index: number,
): string {
  if (result.description && result.description.trim()) {
    return result.description.trim();
  }
  return `${result.type}-${index}`;
}

/* ------------------------------------------------------------------ */
/* Save / Load                                                         */
/* ------------------------------------------------------------------ */

const DEFAULT_BASELINE_FILE = '.chanl-baseline.json';

/**
 * Build a BaselineFile from test results (same shape as test.ts TestFileResult[]).
 */
export function buildBaseline(
  results: Array<{
    file: string;
    scenarioName: string;
    assertions: Array<{ type: string; description: string; passed: boolean }>;
    error?: string;
  }>,
): BaselineFile {
  const baselineResults: Record<string, BaselineTestEntry> = {};

  for (const r of results) {
    if (r.error) continue; // Skip errored tests

    const assertions: Record<string, boolean> = {};
    r.assertions.forEach((a, i) => {
      assertions[assertionKey(a, i)] = a.passed;
    });

    // Compute a score: % of passing assertions (0-100)
    const totalAssertions = r.assertions.length;
    const passedAssertions = r.assertions.filter((a) => a.passed).length;
    const score =
      totalAssertions > 0
        ? Math.round((passedAssertions / totalAssertions) * 100)
        : null;

    baselineResults[r.file] = { score, assertions };
  }

  return {
    version: 1,
    savedAt: new Date().toISOString(),
    results: baselineResults,
  };
}

/**
 * Save baseline results to a JSON file.
 */
export function saveBaseline(
  results: Array<{
    file: string;
    scenarioName: string;
    assertions: Array<{ type: string; description: string; passed: boolean }>;
    error?: string;
  }>,
  filePath?: string,
): string {
  const targetPath = filePath || path.resolve(process.cwd(), DEFAULT_BASELINE_FILE);
  const baseline = buildBaseline(results);
  fs.writeFileSync(targetPath, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
  return targetPath;
}

/**
 * Load a baseline file. Returns null if the file does not exist.
 */
export function loadBaseline(filePath?: string): BaselineFile | null {
  const targetPath = filePath || path.resolve(process.cwd(), DEFAULT_BASELINE_FILE);

  if (!fs.existsSync(targetPath)) {
    return null;
  }

  const content = fs.readFileSync(targetPath, 'utf-8');
  const parsed = JSON.parse(content) as BaselineFile;

  if (parsed.version !== 1) {
    throw new Error(
      `Unsupported baseline version: ${parsed.version}. Expected version 1.`,
    );
  }

  return parsed;
}

/* ------------------------------------------------------------------ */
/* Comparison                                                          */
/* ------------------------------------------------------------------ */

/**
 * Compare current test results against a saved baseline.
 */
export function compareWithBaseline(
  currentResults: Array<{
    file: string;
    scenarioName: string;
    assertions: Array<{ type: string; description: string; passed: boolean }>;
    error?: string;
  }>,
  baseline: BaselineFile,
): BaselineComparison {
  const currentBaseline = buildBaseline(currentResults);
  const allFiles = new Set([
    ...Object.keys(baseline.results),
    ...Object.keys(currentBaseline.results),
  ]);

  const tests: TestComparison[] = [];
  let improved = 0;
  let regressed = 0;
  let unchanged = 0;
  let added = 0;
  let removed = 0;

  for (const file of allFiles) {
    const before = baseline.results[file];
    const after = currentBaseline.results[file];

    if (!before && after) {
      // New test added
      const assertions: AssertionComparison[] = Object.entries(
        after.assertions,
      ).map(([name, passed]) => ({
        name,
        status: 'added' as ComparisonStatus,
        before: null,
        after: passed,
      }));

      tests.push({
        file,
        status: 'added',
        scoreBefore: null,
        scoreAfter: after.score,
        scoreDelta: null,
        assertions,
      });
      added++;
      continue;
    }

    if (before && !after) {
      // Test removed (or errored this run)
      const assertions: AssertionComparison[] = Object.entries(
        before.assertions,
      ).map(([name, passed]) => ({
        name,
        status: 'removed' as ComparisonStatus,
        before: passed,
        after: null,
      }));

      tests.push({
        file,
        status: 'removed',
        scoreBefore: before.score,
        scoreAfter: null,
        scoreDelta: null,
        assertions,
      });
      removed++;
      continue;
    }

    // Both exist — compare assertions
    const allAssertionKeys = new Set([
      ...Object.keys(before.assertions),
      ...Object.keys(after.assertions),
    ]);

    const assertions: AssertionComparison[] = [];
    let hasImprovement = false;
    let hasRegression = false;

    for (const key of allAssertionKeys) {
      const beforeVal = key in before.assertions ? before.assertions[key] : null;
      const afterVal = key in after.assertions ? after.assertions[key] : null;

      let status: ComparisonStatus;
      if (beforeVal === null) {
        status = 'added';
      } else if (afterVal === null) {
        status = 'removed';
      } else if (beforeVal === afterVal) {
        status = 'unchanged';
      } else if (!beforeVal && afterVal) {
        status = 'improved';
        hasImprovement = true;
      } else {
        // Was passing, now failing
        status = 'regressed';
        hasRegression = true;
      }

      assertions.push({ name: key, status, before: beforeVal, after: afterVal });
    }

    const scoreBefore = before.score;
    const scoreAfter = after.score;
    const scoreDelta =
      scoreBefore !== null && scoreAfter !== null
        ? scoreAfter - scoreBefore
        : null;

    let testStatus: ComparisonStatus;
    if (hasRegression) {
      testStatus = 'regressed';
      regressed++;
    } else if (hasImprovement) {
      testStatus = 'improved';
      improved++;
    } else {
      testStatus = 'unchanged';
      unchanged++;
    }

    tests.push({
      file,
      status: testStatus,
      scoreBefore,
      scoreAfter,
      scoreDelta,
      assertions,
    });
  }

  return {
    tests,
    summary: { improved, regressed, unchanged, added, removed },
    hasRegressions: regressed > 0,
  };
}

/* ------------------------------------------------------------------ */
/* Output formatting                                                   */
/* ------------------------------------------------------------------ */

const ICONS: Record<ComparisonStatus, string> = {
  improved: '\u2191',  // up arrow
  regressed: '\u2193', // down arrow
  unchanged: '\u2550', // double horizontal
  added: '+',
  removed: '-',
};

function statusIcon(status: ComparisonStatus): string {
  switch (status) {
    case 'improved':
      return chalk.green(`${ICONS.improved} FIXED`);
    case 'regressed':
      return chalk.red(`${ICONS.regressed} REGRESSED`);
    case 'unchanged':
      return chalk.dim(ICONS.unchanged);
    case 'added':
      return chalk.cyan(ICONS.added + ' NEW');
    case 'removed':
      return chalk.yellow(ICONS.removed + ' REMOVED');
  }
}

function assertionIcon(before: boolean | null, after: boolean | null): string {
  if (before === null) return chalk.cyan('\u2713');
  if (after === null) return chalk.yellow('?');
  return after ? chalk.green('\u2713') : chalk.red('\u2717');
}

/**
 * Print a human-readable baseline comparison to stdout.
 */
export function printBaselineComparison(comparison: BaselineComparison): void {
  console.log('');
  console.log(chalk.bold('Baseline comparison:'));

  for (const test of comparison.tests) {
    // Score line
    const scorePart =
      test.scoreBefore !== null && test.scoreAfter !== null
        ? `${test.scoreBefore} \u2192 ${test.scoreAfter}` +
          (test.scoreDelta !== null && test.scoreDelta !== 0
            ? ` (${test.scoreDelta > 0 ? '+' : ''}${test.scoreDelta})`
            : '') +
          (test.status === 'improved'
            ? chalk.green(' \u2191')
            : test.status === 'regressed'
              ? chalk.red(' \u2193')
              : '')
        : test.status === 'added'
          ? chalk.cyan('new')
          : test.status === 'removed'
            ? chalk.yellow('removed')
            : '';

    console.log(`  ${test.file}: ${scorePart}`);

    // Assertion lines
    for (const a of test.assertions) {
      const beforeStr =
        a.before === null ? '?' : a.before ? '\u2713' : '\u2717';
      const afterStr = a.after === null ? '?' : a.after ? '\u2713' : '\u2717';
      console.log(
        `    ${a.name}: ${beforeStr} \u2192 ${afterStr} ${statusIcon(a.status)}`,
      );
    }
  }

  // Summary line
  console.log('');
  const parts: string[] = [];
  if (comparison.summary.improved > 0) {
    parts.push(chalk.green(`${comparison.summary.improved} improved`));
  }
  if (comparison.summary.regressed > 0) {
    parts.push(chalk.red(`${comparison.summary.regressed} regressed`));
  }
  if (comparison.summary.unchanged > 0) {
    parts.push(`${comparison.summary.unchanged} unchanged`);
  }
  if (comparison.summary.added > 0) {
    parts.push(chalk.cyan(`${comparison.summary.added} added`));
  }
  if (comparison.summary.removed > 0) {
    parts.push(chalk.yellow(`${comparison.summary.removed} removed`));
  }

  console.log(`Summary: ${parts.join(', ')}`);
}
