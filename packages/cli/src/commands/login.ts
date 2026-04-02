import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import axios from 'axios';
import { setConfig, getConfig } from '../config';
import { formatError } from '../client';
import { printSuccess, printError } from '../output';

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate with the chanl-eval server')
    .option('-k, --key <apiKey>', 'API key to store')
    .action(async (options: { key?: string }) => {
      try {
        let apiKey = options.key;

        if (!apiKey) {
          const answers = await inquirer.prompt([
            {
              type: 'password',
              name: 'apiKey',
              message: 'Enter your API key:',
              mask: '*',
              validate: (input: string) => {
                if (!input || input.trim().length === 0) {
                  return 'API key is required';
                }
                return true;
              },
            },
          ]);
          apiKey = answers.apiKey;
        }

        if (!apiKey) {
          printError('No API key provided');
          process.exit(1);
        }

        // Store the key
        setConfig('apiKey', apiKey);

        // Verify the key works by hitting the health endpoint (root path, no /api/v1 prefix)
        const server = getConfig('server');
        try {
          const res = await axios.get(`${server}/health`, { timeout: 3000 });
          const health = res.data;
          printSuccess(
            `Authenticated with ${server} (server v${health.version || 'unknown'})`,
          );
        } catch (err) {
          // Key is stored but server might not be available
          console.log(
            chalk.yellow('Warning:') +
              ` API key saved, but could not verify with server: ${formatError(err)}`,
          );
          console.log(`Server: ${server}`);
          console.log('The key is stored and will be used for future requests.');
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });
}
