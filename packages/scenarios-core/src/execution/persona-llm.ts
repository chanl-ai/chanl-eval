import { OpenAIAdapter } from '../adapters/openai.adapter';
import { AnthropicAdapter } from '../adapters/anthropic.adapter';
import { AgentMessage } from '../adapters/agent-adapter.interface';
import { resolveLlmConfigSync, resolveLlmEndpoint } from './llm-config-resolver';

const USER_TURN =
  'Respond as the customer with your next message only. Stay in character. Keep it to one or two short sentences. No role labels or quotes.';

/**
 * Resolve API material for a separate "persona" LLM call (does not use the agent adapter instance).
 * Delegates to the central resolver (tiers 1-3: config → legacy → env vars).
 */
export function resolvePersonaLlmKey(
  adapterType: string | undefined,
  adapterConfig: Record<string, any> | undefined,
): {
  kind: 'openai' | 'anthropic';
  apiKey: string;
  model?: string;
  baseUrl?: string;
} | null {
  return resolveLlmConfigSync(adapterType, adapterConfig);
}

interface PersonaLlmResolution {
  kind: 'openai' | 'anthropic';
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

/**
 * One place that turns a resolved simulation config into a connected adapter, so the persona honours
 * a custom `baseUrl` the same way the agent-under-test does. Without threading `endpoint` through,
 * the adapter silently falls back to api.openai.com / api.anthropic.com.
 */
async function runPersonaTurn(
  resolved: PersonaLlmResolution,
  systemPrompt: string,
  userMessage: string,
  history: AgentMessage[],
  temperature: number,
  maxTokens: number,
): Promise<string | null> {
  const isOpenAi = resolved.kind === 'openai';
  const adapter = isOpenAi ? new OpenAIAdapter() : new AnthropicAdapter();
  const endpoint = resolveLlmEndpoint(resolved.baseUrl, resolved.kind);

  const config: Record<string, any> = {
    apiKey: resolved.apiKey,
    model: resolved.model || (isOpenAi ? 'gpt-4o-mini' : 'claude-3-5-haiku-20241022'),
    temperature,
    maxTokens,
    systemPrompt,
  };
  // Only set when present — an explicit `undefined` would clobber the adapter's default endpoint.
  if (endpoint) config.endpoint = endpoint;

  await adapter.connect(config);
  try {
    const res = await adapter.sendMessage(userMessage, history);
    const text = (res.content || '').trim();
    return text.length > 0 ? text : null;
  } finally {
    await adapter.disconnect();
  }
}

/**
 * Generate the next persona utterance using an LLM and the persona system prompt.
 */
export async function generatePersonaUtterance(options: {
  personaSystemPrompt: string;
  history: AgentMessage[];
  adapterType?: string;
  adapterConfig?: Record<string, any>;
}): Promise<string | null> {
  const resolved = resolvePersonaLlmKey(
    options.adapterType,
    options.adapterConfig,
  );
  if (!resolved) return null;

  try {
    return await runPersonaTurn(
      resolved,
      options.personaSystemPrompt,
      USER_TURN,
      options.history,
      0.85,
      256,
    );
  } catch {
    return null;
  }
}

/**
 * Optional opening line via LLM (richer than echoing the scenario prompt).
 */
export async function generatePersonaOpening(options: {
  personaSystemPrompt: string;
  scenarioPrompt: string;
  adapterType?: string;
  adapterConfig?: Record<string, any>;
}): Promise<string | null> {
  const resolved = resolvePersonaLlmKey(
    options.adapterType,
    options.adapterConfig,
  );
  if (!resolved) return null;

  const openerUserMsg = `Situation: ${options.scenarioPrompt}

You are starting the conversation as this customer. Say your opening line only — one or two short sentences.`;

  try {
    return await runPersonaTurn(
      resolved,
      options.personaSystemPrompt,
      openerUserMsg,
      [],
      0.8,
      200,
    );
  } catch {
    return null;
  }
}
