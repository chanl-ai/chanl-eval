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
  /**
   * Optional OpenAI-/Anthropic-compatible host for the SIMULATION half (persona + judge).
   * Accepts either a base ("http://localhost:11434/v1") or a full endpoint — see resolveLlmEndpoint.
   * Without this, persona and judge are pinned to api.openai.com / api.anthropic.com while the
   * agent-under-test can point anywhere, which makes running a cheap local model impossible.
   */
  baseUrl?: string;
}

export type SettingsLookup = (provider: string) => Promise<string | undefined>;

function isNonEmpty(val: unknown): val is string {
  return typeof val === 'string' && val.length > 0;
}

/**
 * Resolve a user-supplied base URL to the concrete chat endpoint for a provider kind.
 *
 * People supply these in three shapes and all three should work:
 *   http://localhost:11434/v1                     -> .../v1/chat/completions
 *   https://openrouter.ai/api/v1/chat/completions -> unchanged
 *   http://my-vllm:8000                           -> .../v1/chat/completions
 *
 * A no-op for URLs that already name the endpoint, so passing a full URL is always safe.
 */
export function resolveLlmEndpoint(
  baseUrl: string | undefined,
  kind: 'openai' | 'anthropic',
): string | undefined {
  if (!isNonEmpty(baseUrl)) return undefined;

  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  const path = kind === 'anthropic' ? 'messages' : 'chat/completions';

  if (trimmed.endsWith(`/${path}`)) return trimmed;
  if (/\/v\d+$/.test(trimmed)) return `${trimmed}/${path}`;
  return `${trimmed}/v1/${path}`;
}

/** Pull a simulation base URL out of adapter config / env, in the same precedence as the key. */
function resolveBaseUrl(cfg: Record<string, any>): string | undefined {
  const candidates = [
    cfg.simulationBaseUrl,
    cfg.simulationEndpoint,
    cfg.baseUrl,
    process.env.CHANL_SIMULATION_BASE_URL,
  ];
  return candidates.find(isNonEmpty);
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
  const baseUrl = resolveBaseUrl(cfg);

  // Tier 2: Simulation-specific key (higher priority — dedicated persona/judge key)
  if (isNonEmpty(cfg.simulationApiKey)) {
    return {
      kind: (adapterType === 'anthropic' ? 'anthropic' : 'openai') as 'openai' | 'anthropic',
      apiKey: cfg.simulationApiKey,
      model: cfg.simulationModel || undefined,
      baseUrl,
    };
  }

  // Tier 2b: Legacy explicit persona key fields (always treated as openai)
  const legacyKey = cfg.personaLlmApiKey || cfg.personaOpenAiKey || cfg.openaiApiKey;
  if (isNonEmpty(legacyKey)) {
    return { kind: 'openai', apiKey: legacyKey, model: undefined, baseUrl };
  }

  // Tier 1: Explicit apiKey from adapterConfig
  if (isNonEmpty(cfg.apiKey)) {
    const kind = (adapterType === 'anthropic' ? 'anthropic' : 'openai') as 'openai' | 'anthropic';
    return { kind, apiKey: cfg.apiKey, model: cfg.model || undefined, baseUrl };
  }

  // Tier 3: Environment variables
  // If adapterType is specified, check that provider's env var first
  if (adapterType === 'anthropic') {
    if (isNonEmpty(process.env.CHANL_ANTHROPIC_API_KEY)) {
      return { kind: 'anthropic', apiKey: process.env.CHANL_ANTHROPIC_API_KEY!, model: undefined, baseUrl };
    }
    if (isNonEmpty(process.env.CHANL_OPENAI_API_KEY)) {
      return { kind: 'openai', apiKey: process.env.CHANL_OPENAI_API_KEY!, model: undefined, baseUrl };
    }
  } else {
    // openai or unspecified — check openai first
    if (isNonEmpty(process.env.CHANL_OPENAI_API_KEY)) {
      return { kind: 'openai', apiKey: process.env.CHANL_OPENAI_API_KEY!, model: undefined, baseUrl };
    }
    if (isNonEmpty(process.env.CHANL_ANTHROPIC_API_KEY)) {
      return { kind: 'anthropic', apiKey: process.env.CHANL_ANTHROPIC_API_KEY!, model: undefined, baseUrl };
    }
  }

  // Tier 3b: A self-hosted OpenAI-compatible endpoint (Ollama, vLLM) needs no key. If the operator
  // pointed us at one, honour it rather than reporting "no LLM configured".
  if (isNonEmpty(baseUrl)) {
    return {
      kind: (adapterType === 'anthropic' ? 'anthropic' : 'openai') as 'openai' | 'anthropic',
      apiKey: isNonEmpty(cfg.simulationApiKey) ? cfg.simulationApiKey : 'not-needed',
      model: cfg.simulationModel || undefined,
      baseUrl,
    };
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

  const baseUrl = resolveBaseUrl(adapterConfig || {});

  try {
    // If adapterType specified, try that first
    if (adapterType) {
      const key = await settingsLookup(adapterType);
      if (isNonEmpty(key)) {
        const kind = (adapterType === 'anthropic' ? 'anthropic' : 'openai') as 'openai' | 'anthropic';
        return { kind, apiKey: key, model: undefined, baseUrl };
      }
    }

    // Try openai
    const openaiKey = await settingsLookup('openai');
    if (isNonEmpty(openaiKey)) {
      return { kind: 'openai', apiKey: openaiKey, model: undefined, baseUrl };
    }

    // Try anthropic
    const anthropicKey = await settingsLookup('anthropic');
    if (isNonEmpty(anthropicKey)) {
      return { kind: 'anthropic', apiKey: anthropicKey, model: undefined, baseUrl };
    }
  } catch {
    // Settings lookup failed — graceful degradation
  }

  return null;
}
