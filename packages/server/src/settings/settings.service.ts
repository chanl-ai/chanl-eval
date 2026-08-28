import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Settings,
  SettingsDocument,
  SETTINGS_SINGLETON_KEY,
} from './settings.schema';

/** Prefix used when returning keys to a client. Never accept a value that starts with it. */
export const MASK_PREFIX = '••••';

export type KeySource = 'settings' | 'env' | null;

const ENV_VAR_BY_PROVIDER: Record<string, string> = {
  openai: 'CHANL_OPENAI_API_KEY',
  anthropic: 'CHANL_ANTHROPIC_API_KEY',
};

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectModel(Settings.name)
    private readonly model: Model<SettingsDocument>,
    private readonly config: ConfigService,
  ) {}

  /**
   * The settings singleton, created on first access.
   *
   * Upserts on a constant key so concurrent boots converge on one document. Two settings documents
   * would make `getApiKey` non-deterministic.
   */
  async get(): Promise<SettingsDocument> {
    const existing = await this.model.findOne({ key: SETTINGS_SINGLETON_KEY });
    if (existing) return existing;

    // Adopt a document written before the singleton key existed, so an upgrade does not abandon
    // already-saved provider keys.
    const legacy = await this.model.findOne({ key: { $exists: false } });
    if (legacy) {
      const adopted = await this.model.findByIdAndUpdate(
        legacy._id,
        { $set: { key: SETTINGS_SINGLETON_KEY } },
        { new: true },
      );
      if (adopted) {
        this.logger.log('Adopted pre-existing settings document into the singleton key');
        return adopted;
      }
    }

    try {
      return (await this.model.findOneAndUpdate(
        { key: SETTINGS_SINGLETON_KEY },
        { $setOnInsert: { key: SETTINGS_SINGLETON_KEY } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ))!;
    } catch (error: any) {
      // Lost the insert race against another node. The unique index did its job; re-read the winner.
      if (error?.code === 11000) {
        const winner = await this.model.findOne({ key: SETTINGS_SINGLETON_KEY });
        if (winner) return winner;
      }
      throw error;
    }
  }

  async getApiKey(provider: string): Promise<string | undefined> {
    const settings = await this.get();
    const keys: Record<string, string | undefined> = settings.providerKeys || {};
    const stored = keys[provider];
    if (stored) return stored;

    // Env fallback keeps headless/CI runs working without touching the database.
    const envVar = ENV_VAR_BY_PROVIDER[provider];
    return envVar ? process.env[envVar] || undefined : undefined;
  }

  /**
   * Where each provider's key is coming from, so the UI can tell "not configured" apart from
   * "configured by the operator via the environment" — the difference between an actionable empty
   * state and a confusing one.
   */
  async getKeySources(): Promise<Record<string, KeySource>> {
    const settings = await this.get();
    const keys: Record<string, string | undefined> = settings.providerKeys || {};
    const sources: Record<string, KeySource> = {};

    for (const [provider, envVar] of Object.entries(ENV_VAR_BY_PROVIDER)) {
      if (keys[provider]) sources[provider] = 'settings';
      else if (process.env[envVar]) sources[provider] = 'env';
      else sources[provider] = null;
    }
    return sources;
  }

  /** Simulation host, env first so an operator can pin it for a deployment. */
  async getSimulationBaseUrl(): Promise<string | undefined> {
    const fromEnv = this.config.get<string>('CHANL_SIMULATION_BASE_URL');
    if (fromEnv) return fromEnv;
    const settings = await this.get();
    return settings.simulationBaseUrl || undefined;
  }

  async update(dto: {
    providerKeys?: Record<string, string>;
    simulationBaseUrl?: string;
  }): Promise<SettingsDocument> {
    const settings = await this.get();

    const patch: Record<string, any> = { ...dto };

    if (dto.providerKeys) {
      // Merge, don't replace. `$set: { providerKeys }` would drop every provider the caller did not
      // send — saving an OpenAI key would silently delete the Anthropic one.
      const current: Record<string, string> = {
        ...(settings.providerKeys || {}),
      };

      for (const [provider, value] of Object.entries(dto.providerKeys)) {
        if (value === null || value === '') {
          // Explicit clear.
          delete current[provider];
          continue;
        }
        if (typeof value !== 'string') continue;
        // GET returns masked keys. If a client echoes one back (e.g. an untouched form field),
        // storing it would overwrite the real key with bullets and break every run.
        if (value.startsWith(MASK_PREFIX)) continue;
        current[provider] = value;
      }

      patch.providerKeys = current;
    }

    const updated = await this.model.findByIdAndUpdate(
      settings._id,
      { $set: patch },
      { new: true },
    );
    this.logger.log(
      `Updated settings (providers: ${Object.keys(patch.providerKeys || {}).join(', ') || 'none'})`,
    );
    return updated!;
  }
}
