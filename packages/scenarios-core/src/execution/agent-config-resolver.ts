import { Injectable, Logger } from '@nestjs/common';
import { AgentAdapterConfig, ToolDefinition } from '../adapters/agent-adapter.interface';

/**
 * Minimal prompt shape — matches what we read from the prompts collection.
 * Kept deliberately loose so both ChatService and ExecutionProcessor
 * can pass in a prompt document without importing the Prompt schema.
 */
export interface PromptConfig {
  content: string;
  adapterConfig?: {
    adapterType?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    endpoint?: string;
    [key: string]: any;
  };
}

export interface ResolvedAgentConfig {
  adapterType: string;
  config: AgentAdapterConfig;
}

/**
 * Single source of truth for building an AgentAdapterConfig.
 *
 * Both ChatService (playground) and ExecutionProcessor (simulate)
 * call this instead of assembling config themselves.
 *
 * Resolution priority for API key:
 *   1. overrides.apiKey (explicit per-execution override)
 *   2. Environment: CHANL_OPENAI_API_KEY / CHANL_ANTHROPIC_API_KEY
 *   3. Settings DB (via settingsLookup callback)
 */
@Injectable()
export class AgentConfigResolver {
  private readonly logger = new Logger(AgentConfigResolver.name);

  async resolve(opts: {
    prompt: PromptConfig;
    settingsLookup: (provider: string) => Promise<string | undefined>;
    tools?: ToolDefinition[];
    overrides?: Partial<AgentAdapterConfig> & { adapterType?: string };
  }): Promise<ResolvedAgentConfig> {
    const promptAdapter = opts.prompt.adapterConfig || {};
    const overrides = opts.overrides || {};

    const adapterType = overrides.adapterType || promptAdapter.adapterType || 'openai';

    // Resolve API key: overrides → env → settings
    let apiKey = overrides.apiKey as string | undefined;
    if (!apiKey) {
      apiKey =
        (adapterType === 'openai' ? process.env.CHANL_OPENAI_API_KEY : undefined) ||
        (adapterType === 'anthropic' ? process.env.CHANL_ANTHROPIC_API_KEY : undefined) ||
        process.env.CHANL_OPENAI_API_KEY; // generic fallback
    }
    if (!apiKey) {
      apiKey = await opts.settingsLookup(adapterType) || await opts.settingsLookup('openai');
    }

    if (!apiKey && adapterType !== 'http') {
      this.logger.warn(`No API key resolved for adapter type "${adapterType}"`);
    }

    // Build config from prompt + overrides.
    // CRITICAL: undefined values must NOT be in the config — they overwrite adapter defaults
    // when spread with { ...defaults, ...config }. Strip them.
    const raw: Record<string, any> = {
      systemPrompt: opts.prompt.content,
      apiKey,
      model: promptAdapter.model,
      temperature: promptAdapter.temperature,
      maxTokens: promptAdapter.maxTokens,
      endpoint: promptAdapter.endpoint,
      tools: opts.tools,
    };

    // Apply overrides (except adapterType)
    for (const [key, value] of Object.entries(overrides)) {
      if (key !== 'adapterType') raw[key] = value;
    }

    // Strip undefined/null values so adapter defaults are preserved
    const config: AgentAdapterConfig = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value != null) config[key] = value;
    }

    this.logger.debug(
      `Resolved config: type=${adapterType}, model=${config.model}, hasKey=${!!apiKey}, hasPrompt=${!!config.systemPrompt}, tools=${config.tools?.length || 0}`,
    );

    return { adapterType, config };
  }
}
