/**
 * Builds llmEvaluate for scorecard prompt criteria using OpenAI when a key is available.
 */
export function buildOpenAiJudge(
  apiKey: string | undefined,
  model = 'gpt-4o-mini',
):
  | undefined
  | ((params: {
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
    }>) {
  if (!apiKey) return undefined;

  return async (params) => {
    const thresholdHint =
      params.threshold?.type === 'boolean'
        ? `Expected boolean outcome: ${params.threshold.expectedValue}`
        : params.threshold?.type === 'numerical'
          ? `Score should be between ${params.threshold.min ?? '?' } and ${params.threshold.max ?? '?' }`
          : '';

    const system = `You are a fair evaluator for customer-service quality. Follow the criterion exactly. Respond with JSON only: {"result": boolean|number, "passed": boolean, "reasoning": string, "evidence": string[]}`;

    const user = `Criterion: ${params.criterionName}
Description: ${params.description}
Evaluation type: ${params.evaluationType}
${thresholdHint}

Transcript:
${params.transcript}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI judge error: ${await res.text()}`);
    }

    const data: any = await res.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw) as {
      result?: boolean | number;
      passed?: boolean;
      reasoning?: string;
      evidence?: string[];
    };

    const result = parsed.result ?? (params.evaluationType === 'boolean' ? false : 5);
    const passed =
      parsed.passed ??
      (typeof result === 'boolean' ? result : Number(result) >= 7);

    return {
      result: result as boolean | number,
      passed,
      reasoning: parsed.reasoning || 'LLM evaluation completed.',
      evidence: parsed.evidence || [],
    };
  };
}
