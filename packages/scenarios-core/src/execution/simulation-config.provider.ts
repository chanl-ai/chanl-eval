/**
 * Seam for reading operator-configured simulation credentials without depending on the server.
 *
 * `scenarios-core` sits below `server` in the dependency graph, so it cannot import SettingsService.
 * Previously it worked around that by reaching straight into Mongo
 * (`executionModel.db.collection('settings').findOne({})`) — which duplicated the resolution rules
 * that live in SettingsService, silently diverged from them, and made the judge path impossible to
 * test without a live database.
 *
 * An optional injected provider keeps the dependency direction correct: the server supplies an
 * implementation backed by SettingsService, tests supply a stub, and a consumer that provides
 * nothing simply falls back to environment variables.
 */
export interface SimulationConfigProvider {
  /** Stored API key for a provider ('openai' | 'anthropic'), if the operator has configured one. */
  getApiKey(provider: string): Promise<string | undefined>;

  /** OpenAI-/Anthropic-compatible host for persona + judge calls, if configured. */
  getSimulationBaseUrl(): Promise<string | undefined>;
}

export const SIMULATION_CONFIG_PROVIDER = Symbol('SIMULATION_CONFIG_PROVIDER');
