// ============================================================================
// HUMAN-IN-THE-LOOP BENCHMARKING
// ============================================================================

export interface HumanLabel {
  id: string;
  scorecardResultId: string;
  scenarioExecutionId?: string;
  scorecardId: string;
  criteriaId: string;
  criteriaKey: string;
  criteriaName?: string;
  /** 'boolean' | 'score' */
  evaluationType: string;
  humanResult: boolean | number;
  humanPassed: boolean;
  note?: string;
  labeledBy: string;
  /** The judge's verdict, snapshotted when the label was written. */
  judgeResult?: boolean | number;
  judgePassed?: boolean;
  judgeConfidence?: number;
  judgeReasoning?: string;
  agreed: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateLabelDto {
  scorecardResultId: string;
  criteriaId: string;
  /** Boolean criteria take true/false; score criteria take 0-10. */
  humanResult: boolean | number;
  labeledBy?: string;
  note?: string;
}

export type AgreementInterpretation =
  | 'no data'
  | 'poor'
  | 'slight'
  | 'fair'
  | 'moderate'
  | 'substantial'
  | 'almost perfect';

export interface AgreementStats {
  n: number;
  /** True when there are too few labels for kappa to mean anything — do not render a verdict. */
  underpowered: boolean;
  rawAgreement: number;
  /** null when undefined — no data, or every rating fell in a single category. */
  kappa: number | null;
  interpretation: AgreementInterpretation;
  withinOne?: number;
  meanAbsoluteError?: number;
  meanJudgeConfidence?: number;
}

/**
 * Agreement across a mixed set of criteria. Kappa is reported per criterion TYPE and never pooled:
 * unweighted kappa over pass/fail and quadratic-weighted kappa over 0-10 scores are different
 * statistics on different scales.
 */
export interface OverallAgreement {
  /** Every label compared, both kinds. */
  n: number;
  /** Share of all labels where human and judge agreed; scores count as agreeing within 1 point. */
  rawAgreement: number;
  boolean: AgreementStats;
  score: AgreementStats;
}

export interface CriterionAgreement extends AgreementStats {
  criteriaKey: string;
  criteriaName?: string;
  evaluationType: string;
}

export interface AgreementReport {
  overall: OverallAgreement;
  /** Worst agreement first — the criteria whose verdicts you should trust least. */
  byCriterion: CriterionAgreement[];
  calibration: {
    highConfidence: { n: number; rawAgreement: number };
    lowConfidence: { n: number; rawAgreement: number };
    /** high minus low. Positive means the judge's confidence carries real signal. */
    lift: number | null;
  };
  disagreements: Array<{
    id: string;
    criteriaKey: string;
    criteriaName?: string;
    scorecardResultId: string;
    scenarioExecutionId?: string;
    humanResult: boolean | number;
    judgeResult?: boolean | number;
    judgeConfidence?: number;
    judgeReasoning?: string;
    note?: string;
    labeledBy: string;
    createdAt?: string;
  }>;
}
