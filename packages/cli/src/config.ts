import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CliConfig {
  server: string;
  apiKey: string;
  provider: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  httpEndpoint: string;
  httpApiKey: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  analytics: boolean;
  analyticsId: string;
  [key: string]: string | boolean;
}

const DEFAULT_CONFIG: CliConfig = {
  server: 'http://localhost:18005/api/v1',
  apiKey: '',
  provider: '',
  openaiApiKey: '',
  anthropicApiKey: '',
  httpEndpoint: '',
  httpApiKey: '',
  twilioAccountSid: '',
  twilioAuthToken: '',
  twilioPhoneNumber: '',
  analytics: true,
  analyticsId: '',
};

/**
 * Resolve the config directory path.
 * Uses CHANL_CONFIG_DIR env var if set (useful for testing), otherwise ~/.chanl.
 */
function getConfigDir(): string {
  return process.env.CHANL_CONFIG_DIR || path.join(os.homedir(), '.chanl');
}

function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

/**
 * Load the config from disk. Returns defaults if file does not exist.
 */
export function loadConfig(): CliConfig {
  const configPath = getConfigPath();
  let fromFile: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      fromFile = JSON.parse(raw) as Record<string, unknown>;
    }
  } catch {
    fromFile = {};
  }
  const merged = { ...DEFAULT_CONFIG, ...fromFile } as CliConfig;
  if (!('server' in fromFile) && process.env.CHANL_SERVER_URL) {
    merged.server = process.env.CHANL_SERVER_URL;
  }
  if (!('apiKey' in fromFile) && process.env.CHANL_API_KEY) {
    merged.apiKey = process.env.CHANL_API_KEY;
  }
  if (!('provider' in fromFile) && process.env.CHANL_PROVIDER) {
    merged.provider = process.env.CHANL_PROVIDER;
  }
  if (!('openaiApiKey' in fromFile) && process.env.CHANL_OPENAI_API_KEY) {
    merged.openaiApiKey = process.env.CHANL_OPENAI_API_KEY;
  }
  if (!('anthropicApiKey' in fromFile) && process.env.CHANL_ANTHROPIC_API_KEY) {
    merged.anthropicApiKey = process.env.CHANL_ANTHROPIC_API_KEY;
  }
  if (!('httpEndpoint' in fromFile) && process.env.CHANL_HTTP_ENDPOINT) {
    merged.httpEndpoint = process.env.CHANL_HTTP_ENDPOINT;
  }
  if (!('httpApiKey' in fromFile) && process.env.CHANL_HTTP_API_KEY) {
    merged.httpApiKey = process.env.CHANL_HTTP_API_KEY;
  }
  return merged;
}

/**
 * Save config to disk. Accepts a partial config — missing fields use defaults.
 */
export function saveConfig(config: Partial<CliConfig>): void {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Get a single config value by key.
 */
export function getConfig(key: keyof CliConfig): string | boolean {
  const config = loadConfig();
  return config[key] ?? '';
}

/**
 * Set a single config value by key.
 */
export function setConfig(key: keyof CliConfig, value: string | boolean): void {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}
