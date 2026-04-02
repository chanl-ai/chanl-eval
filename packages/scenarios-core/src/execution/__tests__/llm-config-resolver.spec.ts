import { resolveLlmConfigSync, resolveLlmConfig, ResolvedLlmConfig } from '../llm-config-resolver';

// Save original env vars and restore after each test
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('resolveLlmConfigSync', () => {
  it('returns null when no config and no env vars', () => {
    delete process.env.CHANL_OPENAI_API_KEY;
    delete process.env.CHANL_ANTHROPIC_API_KEY;
    const result = resolveLlmConfigSync(undefined, undefined);
    expect(result).toBeNull();
  });

  it('resolves from adapterConfig.apiKey for openai', () => {
    const result = resolveLlmConfigSync('openai', { apiKey: 'sk-test-123' });
    expect(result).toEqual({ kind: 'openai', apiKey: 'sk-test-123', model: undefined });
  });

  it('resolves from adapterConfig.apiKey for anthropic', () => {
    const result = resolveLlmConfigSync('anthropic', { apiKey: 'sk-ant-test' });
    expect(result).toEqual({ kind: 'anthropic', apiKey: 'sk-ant-test', model: undefined });
  });

  it('resolves simulationApiKey over agent apiKey (tier 2 beats tier 1)', () => {
    const result = resolveLlmConfigSync('openai', {
      apiKey: 'sk-agent-key',
      simulationApiKey: 'sk-sim-key',
      simulationModel: 'gpt-4o',
    });
    expect(result).toEqual({ kind: 'openai', apiKey: 'sk-sim-key', model: 'gpt-4o' });
  });

  it('resolves from CHANL_OPENAI_API_KEY env var (tier 3)', () => {
    delete process.env.CHANL_ANTHROPIC_API_KEY;
    process.env.CHANL_OPENAI_API_KEY = 'sk-env-openai';
    const result = resolveLlmConfigSync(undefined, undefined);
    expect(result).toEqual({ kind: 'openai', apiKey: 'sk-env-openai', model: undefined });
  });

  it('resolves from CHANL_ANTHROPIC_API_KEY env var (tier 3)', () => {
    delete process.env.CHANL_OPENAI_API_KEY;
    process.env.CHANL_ANTHROPIC_API_KEY = 'sk-ant-env';
    const result = resolveLlmConfigSync(undefined, undefined);
    expect(result).toEqual({ kind: 'anthropic', apiKey: 'sk-ant-env', model: undefined });
  });

  it('prefers explicit apiKey over env var (tier 1 beats tier 3)', () => {
    process.env.CHANL_OPENAI_API_KEY = 'sk-env-openai';
    const result = resolveLlmConfigSync('openai', { apiKey: 'sk-explicit' });
    expect(result!.apiKey).toBe('sk-explicit');
  });

  it('resolves model from adapterConfig.model', () => {
    const result = resolveLlmConfigSync('openai', { apiKey: 'sk-test', model: 'gpt-4o' });
    expect(result!.model).toBe('gpt-4o');
  });

  it('resolves simulationModel when simulationApiKey used', () => {
    const result = resolveLlmConfigSync('openai', {
      simulationApiKey: 'sk-sim',
      simulationModel: 'gpt-4o-mini',
    });
    expect(result!.model).toBe('gpt-4o-mini');
  });

  it('handles legacy field: personaLlmApiKey', () => {
    const result = resolveLlmConfigSync(undefined, { personaLlmApiKey: 'sk-persona' });
    expect(result).toEqual({ kind: 'openai', apiKey: 'sk-persona', model: undefined });
  });

  it('handles legacy field: personaOpenAiKey', () => {
    const result = resolveLlmConfigSync(undefined, { personaOpenAiKey: 'sk-persona-oai' });
    expect(result).toEqual({ kind: 'openai', apiKey: 'sk-persona-oai', model: undefined });
  });

  it('handles legacy field: openaiApiKey in config', () => {
    const result = resolveLlmConfigSync(undefined, { openaiApiKey: 'sk-oai-legacy' });
    expect(result).toEqual({ kind: 'openai', apiKey: 'sk-oai-legacy', model: undefined });
  });

  it('defaults to openai kind when adapterType not specified but openai key found in env', () => {
    process.env.CHANL_OPENAI_API_KEY = 'sk-env';
    delete process.env.CHANL_ANTHROPIC_API_KEY;
    const result = resolveLlmConfigSync(undefined, undefined);
    expect(result!.kind).toBe('openai');
  });

  it('prefers adapterType-matched env var over other env var', () => {
    process.env.CHANL_OPENAI_API_KEY = 'sk-oai';
    process.env.CHANL_ANTHROPIC_API_KEY = 'sk-ant';
    const result = resolveLlmConfigSync('anthropic', undefined);
    expect(result).toEqual({ kind: 'anthropic', apiKey: 'sk-ant', model: undefined });
  });

  it('ignores empty string apiKey', () => {
    delete process.env.CHANL_OPENAI_API_KEY;
    delete process.env.CHANL_ANTHROPIC_API_KEY;
    const result = resolveLlmConfigSync('openai', { apiKey: '' });
    expect(result).toBeNull();
  });
});

describe('resolveLlmConfig (async)', () => {
  it('calls settingsLookup when tiers 1-3 return nothing', async () => {
    delete process.env.CHANL_OPENAI_API_KEY;
    delete process.env.CHANL_ANTHROPIC_API_KEY;
    const lookup = jest.fn().mockResolvedValue('sk-from-settings');

    const result = await resolveLlmConfig(undefined, undefined, lookup);

    expect(lookup).toHaveBeenCalled();
    expect(result).toEqual({ kind: 'openai', apiKey: 'sk-from-settings', model: undefined });
  });

  it('does NOT call settingsLookup when tier 1 resolves', async () => {
    const lookup = jest.fn();
    await resolveLlmConfig('openai', { apiKey: 'sk-explicit' }, lookup);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('returns null when settingsLookup returns undefined', async () => {
    delete process.env.CHANL_OPENAI_API_KEY;
    delete process.env.CHANL_ANTHROPIC_API_KEY;
    const lookup = jest.fn().mockResolvedValue(undefined);

    const result = await resolveLlmConfig(undefined, undefined, lookup);
    expect(result).toBeNull();
  });

  it('resolves from settingsLookup for openai', async () => {
    delete process.env.CHANL_OPENAI_API_KEY;
    delete process.env.CHANL_ANTHROPIC_API_KEY;
    const lookup = jest.fn()
      .mockImplementation((provider: string) =>
        provider === 'openai' ? Promise.resolve('sk-settings-oai') : Promise.resolve(undefined),
      );

    const result = await resolveLlmConfig('openai', undefined, lookup);
    expect(result).toEqual({ kind: 'openai', apiKey: 'sk-settings-oai', model: undefined });
    expect(lookup).toHaveBeenCalledWith('openai');
  });

  it('resolves from settingsLookup for anthropic', async () => {
    delete process.env.CHANL_OPENAI_API_KEY;
    delete process.env.CHANL_ANTHROPIC_API_KEY;
    const lookup = jest.fn()
      .mockImplementation((provider: string) =>
        provider === 'anthropic' ? Promise.resolve('sk-ant-settings') : Promise.resolve(undefined),
      );

    const result = await resolveLlmConfig('anthropic', undefined, lookup);
    expect(result).toEqual({ kind: 'anthropic', apiKey: 'sk-ant-settings', model: undefined });
  });

  it('tries both providers in settingsLookup when adapterType not specified', async () => {
    delete process.env.CHANL_OPENAI_API_KEY;
    delete process.env.CHANL_ANTHROPIC_API_KEY;
    const lookup = jest.fn()
      .mockImplementation((provider: string) =>
        provider === 'anthropic' ? Promise.resolve('sk-ant-from-db') : Promise.resolve(undefined),
      );

    const result = await resolveLlmConfig(undefined, undefined, lookup);
    expect(result).toEqual({ kind: 'anthropic', apiKey: 'sk-ant-from-db', model: undefined });
  });

  it('handles settingsLookup errors gracefully (returns null)', async () => {
    delete process.env.CHANL_OPENAI_API_KEY;
    delete process.env.CHANL_ANTHROPIC_API_KEY;
    const lookup = jest.fn().mockRejectedValue(new Error('DB connection failed'));

    const result = await resolveLlmConfig(undefined, undefined, lookup);
    expect(result).toBeNull();
  });

  it('returns null when no settingsLookup provided and tiers 1-3 empty', async () => {
    delete process.env.CHANL_OPENAI_API_KEY;
    delete process.env.CHANL_ANTHROPIC_API_KEY;
    const result = await resolveLlmConfig(undefined, undefined);
    expect(result).toBeNull();
  });
});
