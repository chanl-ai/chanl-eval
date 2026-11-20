/**
 * Judge-vs-human agreement statistics.
 *
 * Pure functions, no DI, no I/O — the maths is the part worth testing, and it should be checkable
 * against worked examples from the literature without standing up a database.
 *
 * Why kappa and not raw agreement: on a criterion where 90% of transcripts genuinely pass, a judge
 * that blindly answers "pass" every time scores 90% raw agreement while carrying zero information.
 * Cohen's kappa subtracts the agreement you would expect from chance given each rater's marginals, so
 * that same judge scores ~0. Publishing raw agreement alone would flatter every judge we ship.
 */

export type Interpretation =
  | 'no data'
  | 'poor'
  | 'slight'
  | 'fair'
  | 'moderate'
  | 'substantial'
  | 'almost perfect';

/**
 * Below this many labels, kappa is noise dressed as a statistic — a single disagreement yields
 * exactly 0.0 ("poor") and a single agreement yields null, neither of which says anything about the
 * judge. Reported so the UI can say "not enough labels yet" instead of rendering a verdict.
 */
export const MIN_LABELS_FOR_KAPPA = 10;

export interface AgreementStats {
  /** Number of (human, judge) pairs compared. */
  n: number;
  /** True when n is too small for kappa to mean anything. Do not render a verdict when set. */
  underpowered: boolean;
  /** Share of pairs where the two agreed exactly, 0-1. */
  rawAgreement: number;
  /**
   * Cohen's kappa (unweighted for boolean criteria, quadratic-weighted for 0-10 scores).
   * null when undefined — no data, or a degenerate case where every rating fell in one category.
   */
  kappa: number | null;
  /** Landis & Koch band for kappa, for readers who do not think in kappa. */
  interpretation: Interpretation;
  /** Score criteria only: share of pairs within 1 point. */
  withinOne?: number;
  /** Score criteria only: mean absolute error, human as reference. */
  meanAbsoluteError?: number;
  /** Judge's mean self-reported confidence over the compared pairs, when it reported any. */
  meanJudgeConfidence?: number;
}

export interface Pair {
  human: boolean | number;
  judge: boolean | number;
  /** Judge's self-consistency confidence, if it ran with k > 1. */
  judgeConfidence?: number;
}

/** Landis & Koch (1977) bands. Conventional, not gospel — reported to make kappa legible. */
export function interpret(kappa: number | null): Interpretation {
  if (kappa === null || Number.isNaN(kappa)) return 'no data';
  if (kappa < 0.01) return 'poor';
  if (kappa < 0.21) return 'slight';
  if (kappa < 0.41) return 'fair';
  if (kappa < 0.61) return 'moderate';
  if (kappa < 0.81) return 'substantial';
  return 'almost perfect';
}

/**
 * Build a square confusion matrix over the given category list.
 * rows = human (the reference), cols = judge.
 */
function confusionMatrix(
  pairs: Array<{ human: number; judge: number }>,
  categories: number[],
): number[][] {
  const index = new Map(categories.map((c, i) => [c, i]));
  const k = categories.length;
  const matrix = Array.from({ length: k }, () => new Array(k).fill(0));

  for (const p of pairs) {
    const r = index.get(p.human);
    const c = index.get(p.judge);
    if (r === undefined || c === undefined) continue;
    matrix[r][c] += 1;
  }
  return matrix;
}

/**
 * Cohen's kappa with an arbitrary weight function.
 * weight(i, j) = 0 when the categories match, rising with distance.
 */
function weightedKappa(
  matrix: number[][],
  weight: (i: number, j: number) => number,
): number | null {
  const k = matrix.length;
  const n = matrix.flat().reduce((s, v) => s + v, 0);
  if (n === 0) return null;

  const rowTotals = matrix.map((row) => row.reduce((s, v) => s + v, 0));
  const colTotals = Array.from({ length: k }, (_, j) =>
    matrix.reduce((s, row) => s + row[j], 0),
  );

  let observed = 0;
  let expected = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const w = weight(i, j);
      observed += w * matrix[i][j];
      expected += (w * rowTotals[i] * colTotals[j]) / n;
    }
  }

  // expected === 0 means every rating from both raters landed in one category. They agree perfectly,
  // but there is no variance for chance-correction to work on, so kappa is undefined. Reporting 1
  // would overstate it and reporting 0 would understate it; null plus rawAgreement is honest.
  if (expected === 0) return null;

  return round4(1 - observed / expected);
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/** Boolean criteria: unweighted kappa over {false, true}. */
export function booleanAgreement(pairs: Pair[]): AgreementStats {
  const usable = pairs.filter(
    (p) => typeof p.human === 'boolean' && typeof p.judge === 'boolean',
  ) as Array<Pair & { human: boolean; judge: boolean }>;

  if (usable.length === 0) return emptyStats();

  const numeric = usable.map((p) => ({
    human: p.human ? 1 : 0,
    judge: p.judge ? 1 : 0,
  }));
  const matrix = confusionMatrix(numeric, [0, 1]);
  const kappa = weightedKappa(matrix, (i, j) => (i === j ? 0 : 1));
  const agreed = numeric.filter((p) => p.human === p.judge).length;

  return {
    n: usable.length,
    underpowered: usable.length < MIN_LABELS_FOR_KAPPA,
    rawAgreement: round4(agreed / usable.length),
    kappa,
    interpretation: interpret(kappa),
    ...confidenceStat(usable),
  };
}

/**
 * Score criteria: quadratic-weighted kappa over integer 0-10.
 *
 * Quadratic weighting is the standard for ordinal rubric scores because it treats a 7-vs-8
 * disagreement as far less serious than 2-vs-9, which unweighted kappa cannot express — it would
 * score both as simply "disagreed".
 */
export function scoreAgreement(pairs: Pair[], max = 10): AgreementStats {
  const usable = pairs.filter(
    (p) =>
      typeof p.human === 'number' &&
      typeof p.judge === 'number' &&
      Number.isFinite(p.human) &&
      Number.isFinite(p.judge),
  ) as Array<Pair & { human: number; judge: number }>;

  if (usable.length === 0) return emptyStats();

  const clampRound = (v: number) =>
    Math.max(0, Math.min(max, Math.round(v)));

  // Buckets are integers; a judge median of 7.5 rounds to 8 for matrix purposes. Raw agreement and
  // MAE below are computed on the UNROUNDED values so nothing is hidden by the bucketing.
  const bucketed = usable.map((p) => ({
    human: clampRound(p.human),
    judge: clampRound(p.judge),
  }));

  const categories = Array.from({ length: max + 1 }, (_, i) => i);
  const matrix = confusionMatrix(bucketed, categories);
  const denom = max * max;
  const kappa = weightedKappa(matrix, (i, j) => ((i - j) * (i - j)) / denom);

  const exact = usable.filter((p) => p.human === p.judge).length;
  const withinOne = usable.filter((p) => Math.abs(p.human - p.judge) <= 1).length;
  const absErr = usable.reduce((s, p) => s + Math.abs(p.human - p.judge), 0);

  return {
    n: usable.length,
    underpowered: usable.length < MIN_LABELS_FOR_KAPPA,
    rawAgreement: round4(exact / usable.length),
    kappa,
    interpretation: interpret(kappa),
    withinOne: round4(withinOne / usable.length),
    meanAbsoluteError: round4(absErr / usable.length),
    ...confidenceStat(usable),
  };
}

/**
 * Pick the right statistic for the shape of the labels.
 *
 * Only safe on a set that is all-boolean or all-score. On a mixed set it would silently drop one
 * kind, so callers holding mixed criteria must use `overallAgreement` instead.
 */
export function agreementFor(pairs: Pair[]): AgreementStats {
  if (pairs.length === 0) return emptyStats();
  const anyNumeric = pairs.some(
    (p) => typeof p.human === 'number' || typeof p.judge === 'number',
  );
  return anyNumeric ? scoreAgreement(pairs) : booleanAgreement(pairs);
}

export interface OverallAgreement {
  /** Every label compared, both kinds. */
  n: number;
  /**
   * Share of all labels where human and judge agreed — scores count as agreeing within 1 point.
   * The one number that spans both criterion types.
   */
  rawAgreement: number;
  /** Unweighted kappa over the boolean criteria only. */
  boolean: AgreementStats;
  /** Quadratic-weighted kappa over the score criteria only. */
  score: AgreementStats;
}

/**
 * Agreement across a mixed set of criteria.
 *
 * Kappa is reported per criterion TYPE and never pooled: an unweighted kappa over pass/fail verdicts
 * and a quadratic-weighted kappa over 0-10 rubric scores are different statistics on different
 * scales, and averaging them produces a number that means nothing. Pooling them naively also drops
 * whichever kind is in the minority, which is worse than useless — it reports a confident `n` that
 * quietly excludes labels the user recorded.
 */
export function overallAgreement(pairs: Pair[]): OverallAgreement {
  const booleanPairs = pairs.filter(
    (p) => typeof p.human === 'boolean' && typeof p.judge === 'boolean',
  );
  const scorePairs = pairs.filter(
    (p) => typeof p.human === 'number' && typeof p.judge === 'number',
  );

  const agreed =
    booleanPairs.filter((p) => p.human === p.judge).length +
    scorePairs.filter(
      (p) => Math.abs((p.human as number) - (p.judge as number)) <= 1,
    ).length;

  const n = booleanPairs.length + scorePairs.length;

  return {
    n,
    rawAgreement: n === 0 ? 0 : round4(agreed / n),
    boolean: booleanAgreement(booleanPairs),
    score: scoreAgreement(scorePairs),
  };
}

function confidenceStat(pairs: Pair[]): { meanJudgeConfidence?: number } {
  const withConfidence = pairs.filter(
    (p) => typeof p.judgeConfidence === 'number',
  );
  if (withConfidence.length === 0) return {};
  const mean =
    withConfidence.reduce((s, p) => s + (p.judgeConfidence as number), 0) /
    withConfidence.length;
  return { meanJudgeConfidence: round4(mean) };
}

function emptyStats(): AgreementStats {
  return {
    n: 0,
    underpowered: true,
    rawAgreement: 0,
    kappa: null,
    interpretation: 'no data',
  };
}

/**
 * Does the judge's self-reported confidence actually predict when it is right?
 *
 * A confidence signal nobody has validated is decoration. If accuracy on high-confidence verdicts is
 * no better than on low-confidence ones, the number should not be shown to users as if it means
 * something.
 */
export function confidenceCalibration(
  pairs: Pair[],
  threshold = 0.99,
): {
  highConfidence: { n: number; rawAgreement: number };
  lowConfidence: { n: number; rawAgreement: number };
  /** high minus low. Positive means confidence carries signal. */
  lift: number | null;
} {
  const scored = pairs.filter((p) => typeof p.judgeConfidence === 'number');
  const agrees = (p: Pair) =>
    typeof p.human === 'number' && typeof p.judge === 'number'
      ? Math.abs(p.human - p.judge) <= 1
      : p.human === p.judge;

  const high = scored.filter((p) => (p.judgeConfidence as number) >= threshold);
  const low = scored.filter((p) => (p.judgeConfidence as number) < threshold);

  const rate = (arr: Pair[]) =>
    arr.length === 0 ? 0 : round4(arr.filter(agrees).length / arr.length);

  const highRate = rate(high);
  const lowRate = rate(low);

  return {
    highConfidence: { n: high.length, rawAgreement: highRate },
    lowConfidence: { n: low.length, rawAgreement: lowRate },
    lift: high.length > 0 && low.length > 0 ? round4(highRate - lowRate) : null,
  };
}
