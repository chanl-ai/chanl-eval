import {
  ScorecardCriteria,
  RagFaithfulnessCriteriaSettings,
  isBooleanThreshold,
  isNumericalThreshold,
} from '../schemas';
import {
  CriteriaHandler,
  CriteriaHandlerResult,
  EvaluationContext,
} from './criteria-handler.interface';
import { checkThreshold } from './scoring-utils';

/** Default tool names considered as retrieval/RAG tools */
const DEFAULT_RETRIEVAL_TOOL_NAMES = [
  'search',
  'kb_search',
  'retrieve',
  'knowledge_search',
];

export class RagFaithfulnessHandler implements CriteriaHandler {
  readonly type = 'rag_faithfulness';

  async evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult> {
    const settings = criteria.settings as RagFaithfulnessCriteriaSettings;
    const evaluationType = settings?.evaluationType || 'boolean';

    // Extract tool calls, default to empty array
    const toolCalls = context.toolCalls ?? [];

    // Determine which tool names count as retrieval tools
    const retrievalToolNames =
      settings?.retrievalToolNames?.length
        ? settings.retrievalToolNames
        : DEFAULT_RETRIEVAL_TOOL_NAMES;

    // Filter tool calls that match retrieval tool names
    const retrievalCalls = toolCalls.filter((tc) => {
      const toolName = tc.name || tc.function?.name || '';
      return retrievalToolNames.includes(toolName);
    });

    // No retrieval tool calls found — nothing to check faithfulness against
    if (retrievalCalls.length === 0) {
      return {
        result: true,
        passed: true,
        reasoning: 'No retrieval tools detected',
        evidence: [],
        notApplicable: true,
      };
    }

    // No LLM available — cannot evaluate faithfulness
    if (!context.llmEvaluate) {
      return {
        result: false,
        passed: false,
        reasoning: 'LLM evaluator not available',
        evidence: [],
      };
    }

    // Empty transcript — nothing to evaluate
    if (!context.transcriptText || context.transcriptText.trim() === '') {
      return {
        result: true,
        passed: true,
        reasoning: 'Empty transcript — skipped',
        evidence: [],
      };
    }

    // Extract retrieved document content from matching tool calls
    const retrievalResults = retrievalCalls.map((tc) => ({
      tool: tc.name || tc.function?.name,
      arguments: tc.arguments,
      result: tc.result,
    }));

    // Build enhanced transcript with retrieved documents prepended
    const enhancedTranscript = `## Retrieved Documents\n${JSON.stringify(retrievalResults, null, 2)}\n\n## Conversation Transcript\n${context.transcriptText}`;

    // Build threshold info for LLM (same pattern as prompt/hallucination handlers)
    let thresholdInfo:
      | {
          type: 'boolean' | 'numerical';
          expectedValue?: boolean;
          min?: number;
          max?: number;
        }
      | undefined;

    if (criteria.threshold) {
      if (isBooleanThreshold(criteria.threshold)) {
        thresholdInfo = {
          type: 'boolean',
          expectedValue: criteria.threshold.expectedValue,
        };
      } else if (isNumericalThreshold(criteria.threshold)) {
        thresholdInfo = {
          type: 'numerical',
          min: criteria.threshold.min,
          max: criteria.threshold.max,
        };
      }
    }

    try {
      const llmResult = await context.llmEvaluate({
        criterionName: criteria.name,
        description:
          'Evaluate whether the agent\'s responses are faithful to the retrieved documents. Check: Does the agent only make claims supported by the retrieved documents? Does it avoid fabricating information not present in the documents? Does it accurately represent the retrieved information without distortion?',
        evaluationType,
        transcript: enhancedTranscript,
        threshold: thresholdInfo,
      });

      return {
        result: llmResult.result,
        passed: llmResult.passed ?? checkThreshold(criteria, llmResult.result),
        reasoning: llmResult.reasoning || 'RAG faithfulness evaluation completed.',
        evidence: llmResult.evidence || [],
      };
    } catch (error: any) {
      return {
        result: false,
        passed: false,
        reasoning: `RAG faithfulness evaluation failed: ${error.message}`,
        evidence: [],
      };
    }
  }
}
