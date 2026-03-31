import { OpenAIAdapter } from '../adapters/openai.adapter';
import { AnthropicAdapter } from '../adapters/anthropic.adapter';
import { AgentMessage } from '../adapters/agent-adapter.interface';

const USER_TURN =
  'Respond as the customer with your next message only. Stay in character. Keep it to one or two short sentences. No role labels or quotes.';

/**
 * Resolve API material for a separate "persona" LLM call (does not use the agent adapter instance).
 */
export function resolvePersonaLlmKey(
  adapterType: string | undefined,
  adapterConfig: Record<string, any> | undefined,
): { kind: 'openai' | 'anthropic'; apiKey: string } | null {
  const cfg = adapterConfig || {};
  const explicit =
    cfg.personaLlmApiKey || cfg.personaOpenAiKey || cfg.openaiApiKey;
  if (typeof explicit === 'string' && explicit.length > 0) {
    return { kind: 'openai', apiKey: explicit };
  }
  if (adapterType === 'openai' && cfg.apiKey) {
    return { kind: 'openai', apiKey: cfg.apiKey };
  }
  if (adapterType === 'anthropic' && cfg.apiKey) {
    return { kind: 'anthropic', apiKey: cfg.apiKey };
  }
  return null;
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
    if (resolved.kind === 'openai') {
      const adapter = new OpenAIAdapter();
      await adapter.connect({
        apiKey: resolved.apiKey,
        model: 'gpt-4o-mini',
        temperature: 0.85,
        maxTokens: 256,
        systemPrompt: options.personaSystemPrompt,
      });
      const res = await adapter.sendMessage(USER_TURN, options.history);
      await adapter.disconnect();
      const text = (res.content || '').trim();
      return text.length > 0 ? text : null;
    }

    const adapter = new AnthropicAdapter();
    await adapter.connect({
      apiKey: resolved.apiKey,
      model: 'claude-3-5-haiku-20241022',
      temperature: 0.85,
      maxTokens: 256,
      systemPrompt: options.personaSystemPrompt,
    });
    const res = await adapter.sendMessage(USER_TURN, options.history);
    await adapter.disconnect();
    const text = (res.content || '').trim();
    return text.length > 0 ? text : null;
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
    if (resolved.kind === 'openai') {
      const adapter = new OpenAIAdapter();
      await adapter.connect({
        apiKey: resolved.apiKey,
        model: 'gpt-4o-mini',
        temperature: 0.8,
        maxTokens: 200,
        systemPrompt: options.personaSystemPrompt,
      });
      const res = await adapter.sendMessage(openerUserMsg, []);
      await adapter.disconnect();
      const text = (res.content || '').trim();
      return text.length > 0 ? text : null;
    }

    const adapter = new AnthropicAdapter();
    await adapter.connect({
      apiKey: resolved.apiKey,
      model: 'claude-3-5-haiku-20241022',
      temperature: 0.8,
      maxTokens: 200,
      systemPrompt: options.personaSystemPrompt,
    });
    const res = await adapter.sendMessage(openerUserMsg, []);
    await adapter.disconnect();
    const text = (res.content || '').trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
