import { ConfigService } from '@nestjs/config';
import type { SimulationConfigProvider } from '@chanl/scenarios-core';
import { SettingsService } from './settings.service';

/**
 * Supplies simulation credentials to `scenarios-core`.
 *
 * Resolution order is operator settings first, then environment. Both live here so the core package
 * reads no configuration of its own.
 */
export function createSimulationConfigProvider(
  settings: SettingsService,
  config: ConfigService,
): SimulationConfigProvider {
  const ENV_KEY_BY_PROVIDER: Record<string, string> = {
    openai: 'CHANL_OPENAI_API_KEY',
    anthropic: 'CHANL_ANTHROPIC_API_KEY',
  };

  return {
    async getApiKey(provider: string): Promise<string | undefined> {
      const stored = await settings.getApiKey(provider);
      if (stored) return stored;

      const envKey = ENV_KEY_BY_PROVIDER[provider];
      return envKey ? config.get<string>(envKey) || undefined : undefined;
    },

    async getSimulationBaseUrl(): Promise<string | undefined> {
      // Environment wins here so an operator can pin the host for a whole deployment regardless of
      // what is stored in the database.
      return (
        config.get<string>('CHANL_SIMULATION_BASE_URL') ||
        (await settings.getSimulationBaseUrl())
      );
    },
  };
}
