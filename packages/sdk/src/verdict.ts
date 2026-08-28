import type { CriterionVerdict } from './types';

const TRUTHY = new Set(['pass', 'passed', 'true', 'yes', 'y']);
const FALSY = new Set(['fail', 'failed', 'false', 'no', 'n']);

/**
 * Coerce a stored verdict into its canonical form, or null when it carries none.
 *
 * The server normalises on write, but rows written earlier still hold strings. Coercing those with
 * Boolean() inverts meaning — Boolean('fail') is true.
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

/** Canonical verdict, falling back to the always-boolean `passed` flag. */
export function verdictOf(result: unknown, passed: boolean): CriterionVerdict {
  const normalized = normalizeVerdict(result);
  return normalized === null ? passed : normalized;
}
