import {
  ScorecardCriteria,
  getEvaluationType,
  isBooleanThreshold,
  isNumericalThreshold,
  isPercentageThreshold,
} from '../schemas';

/**
 * Check whether a result passes the criteria's threshold.
 */
export function checkThreshold(
  criteria: ScorecardCriteria,
  result: any,
): boolean {
  if (!criteria.threshold) return true;

  const evalType = getEvaluationType(criteria);

  if (evalType === 'boolean' && isBooleanThreshold(criteria.threshold)) {
    return result === criteria.threshold.expectedValue;
  }

  if (
    (evalType === 'number' || evalType === 'score') &&
    isNumericalThreshold(criteria.threshold)
  ) {
    const { min, max } = criteria.threshold;
    if (min !== undefined && result < min) return false;
    if (max !== undefined && result > max) return false;
    return true;
  }

  if (evalType === 'percentage' && isPercentageThreshold(criteria.threshold)) {
    const { minPercentage, maxPercentage } = criteria.threshold;
    if (minPercentage !== undefined && result < minPercentage) return false;
    if (maxPercentage !== undefined && result > maxPercentage) return false;
    return true;
  }

  // Fallback: try numerical threshold
  if (isNumericalThreshold(criteria.threshold)) {
    const { min, max } = criteria.threshold;
    if (min !== undefined && result < min) return false;
    if (max !== undefined && result > max) return false;
    return true;
  }

  return true;
}

/**
 * Normalize a criteria result to the 0-10 scale for category averaging.
 */
export function normalizeScore(
  result: any,
  criteria: ScorecardCriteria,
  passed?: boolean,
): number {
  const evalType = getEvaluationType(criteria);

  // Score type: already 0-10, just clamp
  if (evalType === 'score') {
    return Math.max(0, Math.min(10, Number(result) || 0));
  }

  // Boolean type: use `passed` flag if available (handles inverted cases like must_not_contain)
  if (evalType === 'boolean') {
    if (passed !== undefined) return passed ? 10 : 0;
    return result === true ? 10 : 0;
  }

  // Percentage type: 0-100 → 0-10
  if (evalType === 'percentage') {
    return Math.max(0, Math.min(10, (Number(result) || 0) / 10));
  }

  // Number type: normalize based on threshold
  if (evalType === 'number' && isNumericalThreshold(criteria.threshold)) {
    const { min, max } = criteria.threshold;
    const val = Number(result) || 0;

    if (min !== undefined && max !== undefined) {
      if (val >= min && val <= max) return 10;
      if (val < min) return Math.max(0, 10 - (min - val));
      return Math.max(0, 10 - (val - max));
    }

    if (min !== undefined) {
      if (val >= min) return 10;
      return Math.max(0, Math.min(10, 10 * (val / min)));
    }

    if (max !== undefined) {
      if (val <= max) return 10;
      return Math.max(0, 10 - (val - max));
    }
  }

  // Default: binary pass/fail
  return checkThreshold(criteria, result) ? 10 : 0;
}
