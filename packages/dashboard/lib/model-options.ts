/**
 * LLM model options by provider.
 *
 * Shared between Settings page and Playground.
 * Users can also type any model ID in the text input — these are just quick-select presets.
 */

export interface ModelOption {
  value: string;
  label: string;
  description?: string;
}

export const MODEL_OPTIONS: Record<string, ModelOption[]> = {
  openai: [
    // GPT-4.1 family (latest)
    { value: 'gpt-4.1', label: 'GPT-4.1', description: 'Most capable' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', description: 'Fast + cheap' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', description: 'Fastest' },
    // GPT-4o family
    { value: 'gpt-4o', label: 'GPT-4o', description: 'Multimodal' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini', description: 'Budget multimodal' },
    // o-series (reasoning)
    { value: 'o4-mini', label: 'o4-mini', description: 'Reasoning' },
    { value: 'o3-mini', label: 'o3-mini', description: 'Reasoning (older)' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', description: 'Best balance' },
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4', description: 'Most capable' },
    { value: 'claude-haiku-4-20250514', label: 'Claude Haiku 4', description: 'Fastest' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', description: 'Previous gen' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', description: 'Previous gen fast' },
  ],
  http: [
    { value: 'custom', label: 'Custom endpoint', description: 'Model defined by your endpoint' },
  ],
};

/** Get default model for a provider */
export function getDefaultModel(provider: string): string {
  const models = MODEL_OPTIONS[provider];
  return models?.[0]?.value ?? 'gpt-4o-mini';
}
