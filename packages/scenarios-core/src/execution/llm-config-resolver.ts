/**
 * Central LLM configuration resolver for chanl-eval.
 *
 * Replaces 6 scattered resolution paths with a single 4-tier chain:
 *   1. Explicit config (adapterConfig.apiKey)
 *   2. Simulation-specific keys (adapterConfig.simulationApiKey, legacy fields)
 *   3. Environment variables (CHANL_OPENAI_API_KEY, CHANL_ANTHROPIC_API_KEY)
 *   4. Settings DB (async callback)
 */

export interface ResolvedLlmConfig {
  kind: 'openai' | 'anthropic';
  apiKey: string;
  model?: string;
}

export type SettingsLookup = (provider: string) => Promise<string | undefined>;

function isNonEmpty(val: unknown): val is string {
  return typeof val === 'string' && val.length > 0;
}

/**
 * Synchronous resolver — tiers 1-3 (no DB access).
 * Used by persona-llm.ts and persona strategies where async isn't needed.
 */
export function resolveLlmConfigSync(
  adapterType: string | undefined,
  adapterConfig: Record<string, any> | undefined,
): ResolvedLlmConfig | null {
  const cfg = adapterConfig || {};

  // Tier 2: Simulation-specific key (higher priority — dedicated persona/judge key)
  if (isNonEmpty(cfg.simulationApiKey)) {
    return {
      kind: (adapterType === 'anthropic' ? 'anthropic' : 'openai') as 'openai' | 'anthropic',
      apiKey: cfg.simulationApiKey,
      model: cfg.simulationModel || undefined,
    };
  }

  // Tier 2b: Legacy explicit persona key fields (always treated as openai)
  const legacyKey = cfg.personaLlmApiKey || cfg.personaOpenAiKey || cfg.openaiApiKey;
  if (isNonEmpty(legacyKey)) {
    return { kind: 'openai', apiKey: legacyKey, model: undefined };
  }

  // Tier 1: Explicit apiKey from adapterConfig
  if (isNonEmpty(cfg.apiKey)) {
    const kind = (adapterType === 'anthropic' ? 'anthropic' : 'openai') as 'openai' | 'anthropic';
    return { kind, apiKey: cfg.apiKey, model: cfg.model || undefined };
  }

  // Tier 3: Environment variables
  // If adapterType is specified, check that provider's env var first
  if (adapterType === 'anthropic') {
    if (isNonEmpty(process.env.CHANL_ANTHROPIC_API_KEY)) {
      return { kind: 'anthropic', apiKey: process.env.CHANL_ANTHROPIC_API_KEY!, model: undefined };
    }
    if (isNonEmpty(process.env.CHANL_OPENAI_API_KEY)) {
      return { kind: 'openai', apiKey: process.env.CHANL_OPENAI_API_KEY!, model: undefined };
    }
  } else {
    // openai or unspecified — check openai first
    if (isNonEmpty(process.env.CHANL_OPENAI_API_KEY)) {
      return { kind: 'openai', apiKey: process.env.CHANL_OPENAI_API_KEY!, model: undefined };
    }
    if (isNonEmpty(process.env.CHANL_ANTHROPIC_API_KEY)) {
      return { kind: 'anthropic', apiKey: process.env.CHANL_ANTHROPIC_API_KEY!, model: undefined };
    }
  }

  return null;
}

/**
 * Async resolver — all 4 tiers including settings DB lookup.
 * Used by ExecutionProcessor and ChatService where DB access is available.
 */
export async function resolveLlmConfig(
  adapterType: string | undefined,
  adapterConfig: Record<string, any> | undefined,
  settingsLookup?: SettingsLookup,
): Promise<ResolvedLlmConfig | null> {
  // Try tiers 1-3 first (sync)
  const syncResult = resolveLlmConfigSync(adapterType, adapterConfig);
  if (syncResult) return syncResult;

  // Tier 4: Settings DB via async callback
  if (!settingsLookup) return null;

  try {
    // If adapterType specified, try that first
    if (adapterType) {
      const key = await settingsLookup(adapterType);
      if (isNonEmpty(key)) {
        const kind = (adapterType === 'anthropic' ? 'anthropic' : 'openai') as 'openai' | 'anthropic';
        return { kind, apiKey: key, model: undefined };
      }
    }

    // Try openai
    const openaiKey = await settingsLookup('openai');
    if (isNonEmpty(openaiKey)) {
      return { kind: 'openai', apiKey: openaiKey, model: undefined };
    }

    // Try anthropic
    const anthropicKey = await settingsLookup('anthropic');
    if (isNonEmpty(anthropicKey)) {
      return { kind: 'anthropic', apiKey: anthropicKey, model: undefined };
    }
  } catch {
    // Settings lookup failed — graceful degradation
  }

  return null;
}
