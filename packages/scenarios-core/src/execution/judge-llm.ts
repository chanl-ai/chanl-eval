import type { ResolvedLlmConfig } from './llm-config-resolver';

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
}

/** Result from the judge evaluation function */
interface JudgeResult {
  result: boolean | number;
  passed: boolean;
  reasoning: string;
  evidence: string[];
  confidence?: number;
}

type JudgeFn = (params: JudgeParams) => Promise<JudgeResult>;

const SYSTEM_PROMPT = `You are a fair evaluator for AI agent quality in text-based conversations (not phone calls).

Guidelines:
- Evaluate based on the SUBSTANCE of the agent's behavior, not rigid call-center formulas.
- For greetings: acknowledging the customer's situation counts (e.g., "I'm sorry to hear that" is an appropriate opening).
- For closings: well-wishes, offering further help, or positive sign-offs all count as proper closings.
- For issue identification: recognizing what the customer needs counts even if the agent cannot fulfill it directly.
- Be fair — if the agent demonstrates the intent of the criterion, mark it as passed.
- Provide specific evidence by quoting relevant parts of the transcript.

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

function parseJudgeResponse(raw: string, evaluationType: string): JudgeResult {
  try {
    const parsed = JSON.parse(raw) as Partial<JudgeResult>;
    const result = parsed.result ?? (evaluationType === 'boolean' ? false : 5);
    const passed =
      parsed.passed ??
      (typeof result === 'boolean' ? result : Number(result) >= 7);

    return {
      result: result as boolean | number,
      passed,
      reasoning: parsed.reasoning || 'LLM evaluation completed.',
      evidence: parsed.evidence || [],
    };
  } catch {
    // Malformed JSON — return safe defaults
    const result = evaluationType === 'boolean' ? false : 5;
    return {
      result,
      passed: false,
      reasoning: 'LLM evaluation completed (response parsing failed).',
      evidence: [],
    };
  }
}

/**
 * Build an LLM judge function that supports both OpenAI and Anthropic.
 * Returns undefined if config is not provided.
 */
export function buildLlmJudge(
  config: ResolvedLlmConfig | undefined,
): JudgeFn | undefined {
  if (!config) return undefined;

  if (config.kind === 'anthropic') {
    return buildAnthropicJudge(config);
  }
  return buildOpenAiJudgeInternal(config);
}

function buildOpenAiJudgeInternal(config: ResolvedLlmConfig): JudgeFn {
  const model = config.model || 'gpt-4o-mini';

  return async (params) => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(params) },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI judge error: ${await res.text()}`);
    }

    const data: any = await res.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    return parseJudgeResponse(raw, params.evaluationType);
  };
}

function buildAnthropicJudge(config: ResolvedLlmConfig): JudgeFn {
  const model = config.model || 'claude-3-5-haiku-20241022';

  return async (params) => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: buildUserPrompt(params) },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic judge error: ${await res.text()}`);
    }

    const data: any = await res.json();
    const raw = data.content?.[0]?.text || '{}';
    return parseJudgeResponse(raw, params.evaluationType);
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
