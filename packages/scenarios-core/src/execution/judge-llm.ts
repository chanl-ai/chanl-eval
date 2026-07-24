import type { ResolvedLlmConfig } from './llm-config-resolver';
import { resolveLlmEndpoint } from './llm-config-resolver';

/** Params passed to the judge evaluation function */
interface JudgeParams {
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
  /**
   * Number of independent judge samples to draw for this criterion (self-consistency).
   * 1 (default) preserves the original single-call behaviour. k>1 votes across samples and reports
   * inter-sample agreement as `confidence` — a single sample gives you a verdict with no way to tell
   * whether the judge was certain or coin-flipping.
   */
  selfConsistency?: number;
}

/** Result from the judge evaluation function */
interface JudgeResult {
  result: boolean | number | null;
  passed: boolean;
  reasoning: string;
  evidence: string[];
  /** Agreement across self-consistency samples, 0-1. Absent when only one sample was drawn. */
  confidence?: number;
  /**
   * Set when the judge could not produce a verdict at all (transport error, unparseable response).
   * The caller must treat this as "unknown", never as a low score — an infrastructure failure is not
   * evidence about the agent.
   */
  error?: string;
}

type JudgeFn = (params: JudgeParams) => Promise<JudgeResult>;

/** One raw sample from the model. */
interface JudgeSample {
  result: boolean | number;
  passed: boolean;
  reasoning: string;
  evidence: string[];
}

const MAX_SELF_CONSISTENCY = 9;
/** Single-sample temperature — low, we want the modal verdict. */
const SINGLE_SAMPLE_TEMPERATURE = 0.2;
/** Multi-sample temperature — self-consistency needs genuine variance to measure agreement. */
const MULTI_SAMPLE_TEMPERATURE = 0.7;

const SYSTEM_PROMPT = `You are a strict but fair evaluator for AI agent quality.

Rules:
- Evaluate SUBSTANCE, not rigid formulas.
- Be STRICT about template placeholders — if the agent outputs "[insert X here]", "etc.]", or similar unfilled templates, that is a FAILURE for clarity/resolution.
- Reasoning: 1-2 sentences max. State the verdict and the key reason. No filler.
- Evidence: max 2 short quotes (under 15 words each). Pick the most relevant.
- For scores: 7+ = good, 5-6 = mediocre, below 5 = bad.

Respond with JSON only: {"result": boolean|number, "passed": boolean, "reasoning": string, "evidence": string[]}`;

function buildUserPrompt(params: JudgeParams): string {
  const thresholdHint =
    params.threshold?.type === 'boolean'
      ? `Expected boolean outcome: ${params.threshold.expectedValue}`
      : params.threshold?.type === 'numerical'
        ? `Score should be between ${params.threshold.min ?? '?'} and ${params.threshold.max ?? '?'}`
        : '';

  return `Criterion: ${params.criterionName}
Description: ${params.description}
Evaluation type: ${params.evaluationType}
${thresholdHint}

Transcript:
${params.transcript}`;
}

/**
 * Parse one judge response.
 *
 * Throws on unparseable output rather than substituting a default. The previous behaviour returned
 * `{ result: 5, passed: false }` for malformed JSON, which is indistinguishable in the UI from the
 * judge genuinely deciding the agent was mediocre — a transport problem silently became a bad grade.
 */
function parseJudgeResponse(raw: string, evaluationType: string): JudgeSample {
  let parsed: Partial<JudgeSample>;
  try {
    parsed = JSON.parse(raw) as Partial<JudgeSample>;
  } catch {
    throw new Error(
      `judge returned unparseable JSON: ${raw.slice(0, 200)}${raw.length > 200 ? '…' : ''}`,
    );
  }

  if (parsed.result === undefined || parsed.result === null) {
    throw new Error('judge response is missing the "result" field');
  }

  const result = parsed.result;
  const passed =
    parsed.passed ?? (typeof result === 'boolean' ? result : Number(result) >= 7);

  if (evaluationType === 'score' && Number.isNaN(Number(result))) {
    throw new Error(`judge returned a non-numeric score: ${String(result)}`);
  }

  return {
    result: result as boolean | number,
    passed,
    reasoning: parsed.reasoning || 'LLM evaluation completed.',
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
  };
}

/** A single provider call. Returns the raw assistant text. */
type RawJudgeCall = (params: JudgeParams, temperature: number) => Promise<string>;

/**
 * Build an LLM judge function that supports both OpenAI and Anthropic, any OpenAI-/Anthropic-compatible
 * host (via config.baseUrl), and optional self-consistency sampling.
 * Returns undefined if config is not provided.
 */
export function buildLlmJudge(
  config: ResolvedLlmConfig | undefined,
): JudgeFn | undefined {
  if (!config) return undefined;

  const call =
    config.kind === 'anthropic'
      ? buildAnthropicCall(config)
      : buildOpenAiCall(config);

  return async (params) => {
    const k = clampSelfConsistency(params.selfConsistency);
    const temperature = k > 1 ? MULTI_SAMPLE_TEMPERATURE : SINGLE_SAMPLE_TEMPERATURE;

    const samples: JudgeSample[] = [];
    const errors: string[] = [];

    for (let i = 0; i < k; i++) {
      try {
        samples.push(await sampleOnce(call, params, temperature));
      } catch (err: any) {
        errors.push(err?.message || String(err));
      }
    }

    if (samples.length === 0) {
      return {
        result: null,
        passed: false,
        reasoning: `Judge did not return a usable verdict (${k} attempt${k > 1 ? 's' : ''}): ${errors[0] ?? 'unknown error'}`,
        evidence: [],
        error: errors[0] ?? 'unknown error',
      };
    }

    return aggregate(samples, params, k, errors);
  };
}

function clampSelfConsistency(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(MAX_SELF_CONSISTENCY, Math.floor(value)));
}

/**
 * One sample, with a single retry. Judge APIs fail transiently and a malformed JSON body is often
 * fixed by simply asking again — cheaper than discarding the criterion.
 */
async function sampleOnce(
  call: RawJudgeCall,
  params: JudgeParams,
  temperature: number,
): Promise<JudgeSample> {
  try {
    return parseJudgeResponse(await call(params, temperature), params.evaluationType);
  } catch (first: any) {
    try {
      return parseJudgeResponse(await call(params, temperature), params.evaluationType);
    } catch (second: any) {
      throw new Error(
        `${first?.message || first} (retry also failed: ${second?.message || second})`,
      );
    }
  }
}

/**
 * Combine samples into one verdict.
 *
 * boolean → majority vote, confidence = share of the winning verdict.
 * score   → median (robust to one wild sample), confidence = share of samples within ±1 of it.
 */
function aggregate(
  samples: JudgeSample[],
  params: JudgeParams,
  requested: number,
  errors: string[],
): JudgeResult {
  const note =
    errors.length > 0
      ? ` ${errors.length} of ${requested} samples failed and were discarded.`
      : '';

  if (samples.length === 1) {
    const only = samples[0];
    return {
      result: only.result,
      passed: only.passed,
      reasoning: only.reasoning + note,
      evidence: only.evidence,
      ...(requested > 1 ? { confidence: 1 / requested } : {}),
    };
  }

  if (params.evaluationType === 'boolean') {
    const truthy = samples.filter((s) => s.result === true).length;
    const winner = truthy * 2 > samples.length;
    const votes = winner ? truthy : samples.length - truthy;
    const confidence = votes / samples.length;
    const representative =
      samples.find((s) => s.result === winner) ?? samples[0];

    return {
      result: winner,
      // Take `passed` from the winning side rather than recomputing — handles inverted criteria
      // where "result: true" is the failure.
      passed: representative.passed,
      reasoning: `${representative.reasoning} [self-consistency: ${votes}/${samples.length} agreed]${note}`,
      evidence: representative.evidence,
      confidence,
    };
  }

  const scores = samples.map((s) => Number(s.result)).filter((n) => !Number.isNaN(n));
  if (scores.length === 0) {
    return {
      result: null,
      passed: false,
      reasoning: `Judge returned no numeric scores across ${samples.length} samples.${note}`,
      evidence: [],
      error: 'no numeric scores',
    };
  }

  const median = medianOf(scores);
  const withinOne = scores.filter((s) => Math.abs(s - median) <= 1).length;
  const confidence = withinOne / scores.length;
  const representative =
    samples.find((s) => Math.abs(Number(s.result) - median) < 1e-9) ?? samples[0];
  const passedVotes = samples.filter((s) => s.passed).length;

  return {
    result: median,
    passed: passedVotes * 2 > samples.length,
    reasoning: `${representative.reasoning} [self-consistency: median ${median} of ${scores.join(', ')}, ${withinOne}/${scores.length} within ±1]${note}`,
    evidence: representative.evidence,
    confidence,
  };
}

export function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const raw =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  // Keep medians on the same 0.5 grid the models emit, so "median 7.5" reads sensibly.
  return Math.round(raw * 2) / 2;
}

function buildOpenAiCall(config: ResolvedLlmConfig): RawJudgeCall {
  const model = config.model || 'gpt-4o-mini';
  const endpoint =
    resolveLlmEndpoint(config.baseUrl, 'openai') ||
    'https://api.openai.com/v1/chat/completions';

  return async (params, temperature) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(params) },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI judge error (${res.status}): ${await res.text()}`);
    }

    const data: any = await res.json();
    return data.choices?.[0]?.message?.content || '';
  };
}

function buildAnthropicCall(config: ResolvedLlmConfig): RawJudgeCall {
  const model = config.model || 'claude-3-5-haiku-20241022';
  const endpoint =
    resolveLlmEndpoint(config.baseUrl, 'anthropic') ||
    'https://api.anthropic.com/v1/messages';

  return async (params, temperature) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        temperature,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(params) }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic judge error (${res.status}): ${await res.text()}`);
    }

    const data: any = await res.json();
    return data.content?.[0]?.text || '';
  };
}

/**
 * @deprecated Use `buildLlmJudge` with a `ResolvedLlmConfig` instead.
 * Kept for backwards compatibility.
 */
export function buildOpenAiJudge(
  apiKey: string | undefined,
  model = 'gpt-4o-mini',
): JudgeFn | undefined {
  if (!apiKey) return undefined;
  return buildLlmJudge({ kind: 'openai', apiKey, model });
}
