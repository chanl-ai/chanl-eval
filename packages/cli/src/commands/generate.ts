import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { post, formatError } from '../client';
import { printError, printSuccess } from '../output';

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .description('Auto-generate test scenarios, personas, and scorecards from an agent system prompt')
    .option('--from-prompt <prompt>', 'Agent system prompt text')
    .option('--from-file <path>', 'Path to file containing agent system prompt')
    .option('--count <number>', 'Number of scenarios to generate', '10')
    .option('--difficulties <list>', 'Comma-separated difficulties: easy,medium,hard', 'easy,medium,hard')
    .option('--adversarial', 'Include adversarial/red-team scenarios')
    .option('--domain <domain>', 'Override auto-detected domain')
    .option('--preview', 'Preview only — do not save to database')
    .action(async (options) => {
      try {
        await generateAction(options);
      } catch (err: any) {
        printError(formatError(err));
        process.exit(1);
      }
    });
}

async function generateAction(options: {
  fromPrompt?: string;
  fromFile?: string;
  count?: string;
  difficulties?: string;
  adversarial?: boolean;
  domain?: string;
  preview?: boolean;
}): Promise<void> {
  // Resolve system prompt
  let systemPrompt: string | undefined = options.fromPrompt;

  if (options.fromFile) {
    const filePath = path.resolve(options.fromFile);
    if (!fs.existsSync(filePath)) {
      printError(`File not found: ${filePath}`);
      process.exit(1);
    }
    systemPrompt = fs.readFileSync(filePath, 'utf-8');
  }

  if (!systemPrompt?.trim()) {
    printError('System prompt required. Use --from-prompt "..." or --from-file <path>');
    process.exit(1);
  }

  const count = parseInt(options.count || '10', 10);
  const difficulties = (options.difficulties || 'easy,medium,hard')
    .split(',')
    .map((d) => d.trim()) as ('easy' | 'medium' | 'hard')[];

  const body = {
    systemPrompt,
    count,
    difficulties,
    includeAdversarial: Boolean(options.adversarial),
    domain: options.domain,
  };

  if (options.preview) {
    const spinner = ora('Generating test suite preview...').start();
    try {
      const result = await post('/generation/preview', body);
      spinner.stop();
      const suite = result.suite;
      printSuitePreview(suite);
    } catch (err) {
      spinner.fail('Generation failed');
      throw err;
    }
  } else {
    const spinner = ora('Generating and saving test suite...').start();
    try {
      const result = await post('/generation/from-prompt', body);
      spinner.stop();
      const r = result.result;
      printSuccess(
        `Generated ${r.scenarioIds.length} scenarios, ${r.personaIds.length} personas, ${r.scorecardId ? '1 scorecard' : '0 scorecards'}`,
      );
      console.log(chalk.dim(`  Domain: ${r.domain}`));
      console.log(chalk.dim(`  ${r.summary}`));
      console.log('');
      console.log(chalk.dim('  View scenarios: chanl scenarios list'));
      console.log(chalk.dim('  Run all:        chanl run --all'));
    } catch (err) {
      spinner.fail('Generation failed');
      throw err;
    }
  }
}

function printSuitePreview(suite: any): void {
  console.log('');
  console.log(chalk.bold(`Test Suite Preview`));
  console.log(chalk.dim(`Domain: ${suite.domain} | ${suite.summary}`));
  console.log('');

  // Scenarios
  console.log(chalk.bold.underline(`Scenarios (${suite.scenarios?.length || 0})`));
  for (const s of suite.scenarios || []) {
    const diffColor =
      s.difficulty === 'easy' ? chalk.green : s.difficulty === 'hard' ? chalk.red : chalk.yellow;
    console.log(`  ${diffColor(`[${s.difficulty}]`)} ${chalk.bold(s.name)}`);
    console.log(`    ${chalk.dim(truncateText(s.prompt, 100))}`);
  }
  console.log('');

  // Personas
  console.log(chalk.bold.underline(`Personas (${suite.personas?.length || 0})`));
  for (const p of suite.personas || []) {
    console.log(
      `  ${chalk.bold(p.name)} — ${p.emotion}, ${p.behavior?.cooperationLevel || 'cooperative'}`,
    );
  }
  console.log('');

  // Scorecard
  if (suite.scorecard) {
    console.log(chalk.bold.underline(`Scorecard: ${suite.scorecard.name}`));
    for (const c of suite.scorecard.criteria || []) {
      console.log(`  ${chalk.cyan(c.type)} ${c.name} — ${chalk.dim(c.description || '')}`);
    }
  }
  console.log('');
  console.log(chalk.dim('Run without --preview to save to database.'));
}

function truncateText(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}
