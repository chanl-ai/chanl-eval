import { Command } from 'commander';
import { getConfig, setConfig, loadConfig, CliConfig } from '../config';
import { printSuccess, printError, printJson } from '../output';

const VALID_KEYS: Array<keyof CliConfig> = [
  'server',
  'apiKey',
  'provider',
  'openaiApiKey',
  'anthropicApiKey',
  'httpEndpoint',
  'httpApiKey',
  'twilioAccountSid',
  'twilioAuthToken',
  'twilioPhoneNumber',
  'analytics',
  'analyticsId',
];

const SECRET_KEYS: Array<keyof CliConfig> = [
  'apiKey',
  'openaiApiKey',
  'anthropicApiKey',
  'httpApiKey',
  'twilioAuthToken',
];

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage CLI configuration');

  configCmd
    .command('set <key> <value>')
    .description(
      `Set a configuration value (${VALID_KEYS.join(', ')})`,
    )
    .action((key: string, value: string) => {
      if (!VALID_KEYS.includes(key as keyof CliConfig)) {
        printError(
          `Invalid config key "${key}". Valid keys: ${VALID_KEYS.join(', ')}`,
        );
        process.exit(1);
      }

      // Handle boolean values
      const parsedValue =
        value === 'true' ? true : value === 'false' ? false : value;

      setConfig(key as keyof CliConfig, parsedValue as string | boolean);
      const display = SECRET_KEYS.includes(key as keyof CliConfig)
        ? maskKey(String(value))
        : value;
      printSuccess(`${key} = ${display}`);
    });

  configCmd
    .command('get <key>')
    .description('Get a configuration value')
    .action((key: string) => {
      if (!VALID_KEYS.includes(key as keyof CliConfig)) {
        printError(
          `Invalid config key "${key}". Valid keys: ${VALID_KEYS.join(', ')}`,
        );
        process.exit(1);
      }
      const value = getConfig(key as keyof CliConfig);
      if (SECRET_KEYS.includes(key as keyof CliConfig) && value) {
        console.log(maskKey(String(value)));
      } else {
        console.log(value !== undefined && value !== '' ? String(value) : '(not set)');
      }
    });

  configCmd
    .command('list')
    .description('Show all configuration values')
    .action(() => {
      const config = loadConfig();
      const format = program.opts().format;

      const display: Record<string, string> = {};
      for (const key of VALID_KEYS) {
        const val = config[key];
        if (SECRET_KEYS.includes(key) && val) {
          display[key] = maskKey(String(val));
        } else {
          display[key] = val !== undefined && val !== '' ? String(val) : '(not set)';
        }
      }

      if (format === 'json') {
        printJson(display);
      } else {
        for (const [k, v] of Object.entries(display)) {
          console.log(`${k.padEnd(20)} ${v}`);
        }
      }
    });
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '...' + key.slice(-4);
}
