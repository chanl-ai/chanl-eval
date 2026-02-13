import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CliConfig {
  server: string;
  apiKey: string;
}

const DEFAULT_CONFIG: CliConfig = {
  server: 'http://localhost:8005',
  apiKey: '',
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
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch {
    // Ignore parse errors, return defaults
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save the full config to disk.
 */
export function saveConfig(config: CliConfig): void {
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
export function getConfig(key: keyof CliConfig): string {
  const config = loadConfig();
  return config[key] || '';
}

/**
 * Set a single config value by key.
 */
export function setConfig(key: keyof CliConfig, value: string): void {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}
