import {
  ScorecardCriteria,
  CriteriaResult,
} from '../schemas';

/**
 * Context provided to criteria handlers for evaluation.
 * Handlers extract what they need from this context.
 */
export interface EvaluationContext {
  /** Full transcript text (all segments joined) */
  transcriptText: string;

  /** Individual transcript segments with metadata */
  segments?: Array<{
    speaker: string;
    text: string;
    startTime?: number;
    endTime?: number;
    duration?: number;
  }>;

  /** Interaction-level metrics */
  metrics?: {
    duration?: number;
    firstResponseLatency?: number;
    avgSegmentLength?: Record<string, number>;
  };

  /** Tool calls made during the interaction */
  toolCalls?: Array<{
    name: string;
    /** Object form, or a JSON string as some providers send it. */
    arguments?: Record<string, any> | string;
    result?: any;
    timestamp?: Date;
    /** 1-based conversation turn the call happened in, when known. */
    turn?: number;
    function?: { name: string; arguments?: string | Record<string, any> };
  }>;

  /** Ground truth facts for hallucination detection */
  groundTruth?: string;

  /** Optional LLM evaluation function for prompt-type criteria */
  llmEvaluate?: (params: {
    criterionName: string;
    description: string;
    evaluationType: 'boolean' | 'score';
    transcript: string;
    threshold?: {
      type: 'boolean' | 'numerical';
      expectedValue?: boolean;
      min?: number;
      max?: number;
    };
    /** Draw k independent samples and vote (self-consistency). Default 1. */
    selfConsistency?: number;
  }) => Promise<{
    result: boolean | number | null;
    passed: boolean;
    reasoning: string;
    evidence: string[];
    /** Inter-sample agreement 0-1, present when more than one sample was drawn. */
    confidence?: number;
    /** Set when no verdict could be produced — treat as unknown, never as a low score. */
    error?: string;
  }>;
}

/**
 * Interface for criteria type handlers.
 * Each handler evaluates a specific type of criterion.
 */
export interface CriteriaHandler {
  /** The criteria type this handler supports (matches CriteriaType enum) */
  readonly type: string;

  /**
   * Evaluate a criterion against the provided context.
   * @param criteria - The criterion definition (settings, threshold, etc.)
   * @param context - The evaluation context (transcript, metrics, etc.)
   * @returns A partial CriteriaResult with result, passed, reasoning, evidence
   */
  evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult>;
}

/**
 * Result from a criteria handler evaluation.
 */
export interface CriteriaHandlerResult {
  result: any;
  passed: boolean;
  reasoning: string;
  evidence: string[];
  /** When true, this criterion was skipped (no ground truth, no tools, etc.) — should display as N/A, not pass/fail */
  notApplicable?: boolean;
  /** The verdict is not trustworthy as given and should be shown as "Needs review". */
  needsReview?: boolean;
  /**
   * How much to trust this verdict, 0-1. Currently emitted by LLM-judge criteria running with
   * self-consistency: the share of samples that agreed. Deterministic handlers omit it (they have
   * no sampling variance to report).
   */
  confidence?: number;
}
