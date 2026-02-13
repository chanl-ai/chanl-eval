import { Command } from 'commander';
import { registerConfigCommand } from './commands/config';
import { registerLoginCommand } from './commands/login';
import { registerScenariosCommand } from './commands/scenarios';
import { registerPersonasCommand } from './commands/personas';
import { registerScorecardsCommand } from './commands/scorecards';

const VERSION = '0.1.0';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('chanl')
    .description('CLI for chanl-eval: manage scenarios, personas, and scorecards')
    .version(VERSION, '-v, --version', 'Output the current version')
    .option('-f, --format <format>', 'Output format: table or json', 'table');

  // Register all command groups
  registerConfigCommand(program);
  registerLoginCommand(program);
  registerScenariosCommand(program);
  registerPersonasCommand(program);
  registerScorecardsCommand(program);

  return program;
}

// When this module is run directly (via bin/chanl), parse argv
if (require.main === module) {
  const program = createProgram();
  program.parseAsync(process.argv).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { loadConfig, saveConfig, getConfig, setConfig } from './config';
export { createClient, get, post, put, del, formatError } from './client';
export { printTable, printJson, printOutput } from './output';
