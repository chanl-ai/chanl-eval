import { Command } from 'commander';
import { registerConfigCommand } from './commands/config';
import { registerLoginCommand } from './commands/login';
import { registerScenariosCommand, runScenarioAction } from './commands/scenarios';
import { registerPersonasCommand } from './commands/personas';
import { registerScorecardsCommand } from './commands/scorecards';
import { registerServerCommand } from './commands/server';
import { registerInitCommand } from './commands/init';
import { registerAnalyticsCommand } from './commands/analytics';
import { registerTestCommand } from './commands/test';
import { registerCompareCommand } from './commands/compare';
import { registerExecutionsCommand } from './commands/executions';
import { initAnalytics, track } from './analytics';

const VERSION = '0.1.0';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('chanl')
    .description('CLI for chanl-eval: AI agent testing framework')
    .version(VERSION, '-v, --version', 'Output the current version')
    .option('-f, --format <format>', 'Output format: table or json', 'table')
    .option('--json', 'Shorthand for --format json');

  // --json is a shorthand for --format json
  program.hook('preAction', (_thisCommand, _actionCommand) => {
    const opts = program.opts();
    if (opts.json) {
      opts.format = 'json';
    }
  });

  // Initialize analytics on startup
  initAnalytics();

  // Register all command groups
  registerInitCommand(program);
  registerConfigCommand(program);
  registerLoginCommand(program);
  registerScenariosCommand(program);
  registerPersonasCommand(program);
  registerScorecardsCommand(program);
  registerServerCommand(program);
  registerAnalyticsCommand(program);
  registerTestCommand(program);
  registerCompareCommand(program);
  registerExecutionsCommand(program);

  // Top-level `run` shortcut → delegates to scenarios run
  program
    .command('run [scenario]')
    .description('Run a scenario (shortcut for "chanl scenarios run")')
    .option('--agent <path>', 'Path to agent YAML file (test prompts without deploying)')
    .option('--agent-id <agentId>', 'Override agent ID')
    .option('--persona-id <personaId>', 'Override persona ID')
    .option('--scorecard-id <scorecardId>', 'Override scorecard ID')
    .option('--mode <mode>', 'Execution mode: text or phone', 'text')
    .option('--dry-run', 'Dry run without actually executing')
    .option('--no-wait', 'Do not wait for completion')
    .option('--all', 'Run all active scenarios')
    .action(async (scenario: string | undefined, options) => {
      try {
        await runScenarioAction(scenario, options, program.opts().format);
        track('cli_run', { shortcut: true });
      } catch (err: any) {
        const { printError, } = await import('./output');
        const { formatError } = await import('./client');
        printError(formatError(err));
        process.exit(1);
      }
    });

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
export { initAnalytics, track } from './analytics';
export { ensureServerRunning } from './commands/server';
