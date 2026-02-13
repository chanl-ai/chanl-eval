import { Command } from 'commander';
import { getConfig, setConfig, loadConfig, CliConfig } from '../config';
import { printSuccess, printError, printJson } from '../output';

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage CLI configuration');

  configCmd
    .command('set <key> <value>')
    .description('Set a configuration value (server, apiKey)')
    .action((key: string, value: string) => {
      const validKeys: Array<keyof CliConfig> = ['server', 'apiKey'];
      if (!validKeys.includes(key as keyof CliConfig)) {
        printError(`Invalid config key "${key}". Valid keys: ${validKeys.join(', ')}`);
        process.exit(1);
      }
      setConfig(key as keyof CliConfig, value);
      printSuccess(`${key} = ${key === 'apiKey' ? maskKey(value) : value}`);
    });

  configCmd
    .command('get <key>')
    .description('Get a configuration value')
    .action((key: string) => {
      const validKeys: Array<keyof CliConfig> = ['server', 'apiKey'];
      if (!validKeys.includes(key as keyof CliConfig)) {
        printError(`Invalid config key "${key}". Valid keys: ${validKeys.join(', ')}`);
        process.exit(1);
      }
      const value = getConfig(key as keyof CliConfig);
      if (key === 'apiKey' && value) {
        console.log(maskKey(value));
      } else {
        console.log(value || '(not set)');
      }
    });

  configCmd
    .command('list')
    .description('Show all configuration values')
    .action(() => {
      const config = loadConfig();
      const display = {
        server: config.server || '(not set)',
        apiKey: config.apiKey ? maskKey(config.apiKey) : '(not set)',
      };

      const format = program.opts().format;
      if (format === 'json') {
        printJson(display);
      } else {
        console.log(`server:  ${display.server}`);
        console.log(`apiKey:  ${display.apiKey}`);
      }
    });
}

/**
 * Mask an API key for display, showing only prefix and last 4 characters.
 */
function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '...' + key.slice(-4);
}
