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
}
