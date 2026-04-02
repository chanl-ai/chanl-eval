import { resolvePersonaLlmKey } from '../persona-llm';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('resolvePersonaLlmKey', () => {
  // Existing behavior (should still work)
  it('resolves from simulationApiKey', () => {
    const result = resolvePersonaLlmKey('openai', { simulationApiKey: 'sk-sim', simulationModel: 'gpt-4o' });
    expect(result).toEqual({ kind: 'openai', apiKey: 'sk-sim', model: 'gpt-4o' });
  });

  it('resolves from legacy personaLlmApiKey', () => {
    const result = resolvePersonaLlmKey(undefined, { personaLlmApiKey: 'sk-persona' });
    expect(result).toEqual({ kind: 'openai', apiKey: 'sk-persona', model: undefined });
  });

  it('resolves from agent apiKey for openai', () => {
    const result = resolvePersonaLlmKey('openai', { apiKey: 'sk-agent' });
    expect(result).toEqual({ kind: 'openai', apiKey: 'sk-agent', model: undefined });
  });

  it('resolves from agent apiKey for anthropic', () => {
    const result = resolvePersonaLlmKey('anthropic', { apiKey: 'sk-ant-agent' });
    expect(result).toEqual({ kind: 'anthropic', apiKey: 'sk-ant-agent', model: undefined });
  });

  it('returns null when no config', () => {
    delete process.env.CHANL_OPENAI_API_KEY;
    delete process.env.CHANL_ANTHROPIC_API_KEY;
    const result = resolvePersonaLlmKey(undefined, undefined);
    expect(result).toBeNull();
  });

  // NEW: env var resolution (was previously missing — the whole point of this fix)
  it('resolves from CHANL_OPENAI_API_KEY env var', () => {
    process.env.CHANL_OPENAI_API_KEY = 'sk-env-openai';
    delete process.env.CHANL_ANTHROPIC_API_KEY;
    const result = resolvePersonaLlmKey(undefined, undefined);
    expect(result).toEqual({ kind: 'openai', apiKey: 'sk-env-openai', model: undefined });
  });

  it('resolves from CHANL_ANTHROPIC_API_KEY env var', () => {
    delete process.env.CHANL_OPENAI_API_KEY;
    process.env.CHANL_ANTHROPIC_API_KEY = 'sk-ant-env';
    const result = resolvePersonaLlmKey(undefined, undefined);
    expect(result).toEqual({ kind: 'anthropic', apiKey: 'sk-ant-env', model: undefined });
  });

  it('prefers adapterType-matched env var', () => {
    process.env.CHANL_OPENAI_API_KEY = 'sk-oai';
    process.env.CHANL_ANTHROPIC_API_KEY = 'sk-ant';
    const result = resolvePersonaLlmKey('anthropic', undefined);
    expect(result).toEqual({ kind: 'anthropic', apiKey: 'sk-ant', model: undefined });
  });

  // Priority: simulationApiKey > legacy > agent apiKey > env
  it('prefers simulationApiKey over env var', () => {
    process.env.CHANL_OPENAI_API_KEY = 'sk-env';
    const result = resolvePersonaLlmKey('openai', { simulationApiKey: 'sk-sim' });
    expect(result!.apiKey).toBe('sk-sim');
  });

  it('returns same shape {kind, apiKey, model?}', () => {
    const result = resolvePersonaLlmKey('openai', { apiKey: 'sk-test' });
    expect(result).toHaveProperty('kind');
    expect(result).toHaveProperty('apiKey');
    expect(result).toHaveProperty('model');
  });
});
