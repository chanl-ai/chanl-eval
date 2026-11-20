/**
 * A criterion verdict: a pass/fail boolean or a 0-10 score.
 *
 * Stored values are historically looser than this — numbers, booleans and the strings "pass" and
 * "fail" all appear, depending on which producer wrote the row. Consumers that branched on `typeof`
 * therefore fell through on strings, silently: the CLI dropped scores, and agreement was derived
 * with `Boolean('fail')`, which is `true`.
 *
 * Normalise at the point a value enters the system, and treat everything downstream as this type.
 */
export type CriterionVerdict = boolean | number;

const TRUTHY = new Set(['pass', 'passed', 'true', 'yes', 'y']);
const FALSY = new Set(['fail', 'failed', 'false', 'no', 'n']);

/**
 * Coerce a stored verdict into its canonical form.
 *
 * Returns null when the value carries no verdict, so callers must decide explicitly what an
 * unreadable verdict means rather than inheriting a coincidental truthy or falsy result.
 */
export function normalizeVerdict(value: unknown): CriterionVerdict | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === '') return null;
    if (TRUTHY.has(v)) return true;
    if (FALSY.has(v)) return false;

    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

/**
 * Canonical verdict, falling back to the criterion's `passed` flag when the raw value is unreadable.
 * `passed` is always a boolean, so this never returns null.
 */
export function verdictOf(
  result: unknown,
  passed: boolean,
): CriterionVerdict {
  const normalized = normalizeVerdict(result);
  return normalized === null ? passed : normalized;
}

/** Score criteria are the numeric ones; everything else is pass/fail. */
export function isScoreVerdict(verdict: CriterionVerdict): verdict is number {
  return typeof verdict === 'number';
}
