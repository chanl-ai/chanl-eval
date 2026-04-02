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
    arguments?: Record<string, any>;
    result?: any;
    timestamp?: Date;
    function?: { name: string };
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
  }) => Promise<{
    result: boolean | number;
    passed: boolean;
    reasoning: string;
    evidence: string[];
    confidence?: number;
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
}
