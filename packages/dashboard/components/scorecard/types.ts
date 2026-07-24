/**
 * Scorecard component prop types.
 * Copied from @chanl-ai/platform-sdk — pure presentation types, zero SDK dependencies.
 */

/** A single criterion evaluation result */
export interface ScorecardCriterionDisplay {
  name: string;
  passed: boolean;
  explanation?: string;
  evidence?: string[];
  confidence?: number;
  notApplicable?: boolean;
  notApplicableReason?: string;
  /** Required to attach a human verdict or link to the criterion definition. */
  criteriaId?: string;
  /** The judge's raw verdict: boolean for pass/fail criteria, 0-10 for scored ones. */
  result?: boolean | number;
}

/** A human verdict already recorded against a criterion. */
export interface CriterionReview {
  agreed: boolean;
  humanResult: boolean | number;
  note?: string;
}

/**
 * Optional review affordances. Supplied by pages that can persist a verdict; omitted elsewhere, in
 * which case the widget stays purely presentational.
 */
export interface ScorecardReviewOptions {
  /** Existing verdicts, keyed by criteriaId. */
  reviews?: Record<string, CriterionReview>;
  /** Persist a verdict. `agree` sends the judge's own value back. */
  onReview: (
    criteriaId: string,
    humanResult: boolean | number,
    note?: string,
  ) => void;
  /** Open the criterion's definition for editing. */
  onEditCriterion?: (criteriaId: string) => void;
  pending?: boolean;
}

/** A category-level score metric (groups criteria) */
export interface ScoreMetric {
  name: string;
  score: number;
  maxScore: number;
  status: 'pass' | 'fail';
  criteria?: ScorecardCriterionDisplay[];
}

/** Props for the main ScorecardWidget */
export interface ScorecardWidgetProps {
  metrics: ScoreMetric[];
  overallScorePercentage?: number;
  overallStatus?: 'pass' | 'fail' | 'warning';
  summary?: string;
  onRunAgain?: () => void;
  className?: string;
  review?: ScorecardReviewOptions;
}
