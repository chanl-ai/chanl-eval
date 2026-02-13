import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import chalk from 'chalk';
import ora from 'ora';
import { get, post, formatError } from '../client';
import { printOutput, printSuccess, printError, truncate } from '../output';

/**
 * Shared run action — used by both `chanl scenarios run` and `chanl run`.
 */
export async function runScenarioAction(
  idOrNameOrFile: string | undefined,
  options: {
    agentId?: string;
    personaId?: string;
    scorecardId?: string;
    mode?: string;
    dryRun?: boolean;
    wait?: boolean;
    all?: boolean;
  },
  format?: string,
): Promise<void> {
  // Handle --all: run all active scenarios
  if (options.all || !idOrNameOrFile) {
    const result = await get('/scenarios', { status: 'active', limit: '100' });
    const items = result.scenarios || [];
    if (items.length === 0) {
      printError(
        'No active scenarios found. Create one with: chanl scenarios create',
      );
      process.exit(1);
    }

    console.log(`Running ${items.length} scenario(s)...\n`);
    for (const scenario of items) {
      const sid = scenario.id || scenario._id;
      console.log(chalk.bold(`→ ${scenario.name}`));
      try {
        await executeAndPoll(sid, options, format);
      } catch (err) {
        printError(`  ${formatError(err)}`);
      }
      console.log('');
    }
    return;
  }

  let scenarioId = idOrNameOrFile;

  // Check if the argument is a YAML file path
  if (idOrNameOrFile.endsWith('.yaml') || idOrNameOrFile.endsWith('.yml')) {
    const filePath = path.resolve(idOrNameOrFile);
    if (!fs.existsSync(filePath)) {
      printError(`File not found: ${filePath}`);
      process.exit(1);
    }

    const spinner = ora('Importing scenario from YAML...').start();
    try {
      const yamlContent = fs.readFileSync(filePath, 'utf-8');
      yaml.load(yamlContent);

      const importResult = await post('/scenarios/import/yaml', {
        yaml: yamlContent,
      });
      const imported = importResult.scenario;
      scenarioId = imported.id || imported._id;
      spinner.succeed(`Imported scenario: ${imported.name} (${scenarioId})`);
    } catch (importErr) {
      spinner.fail('Failed to import YAML');
      printError(formatError(importErr));
      process.exit(1);
    }
  } else if (!isObjectId(idOrNameOrFile)) {
    // Try to find scenario by name (slug match)
    const result = await get('/scenarios', { limit: '200' });
    const items = result.scenarios || [];
    const match = items.find(
      (s: any) =>
        slugify(s.name) === slugify(idOrNameOrFile) ||
        s.name.toLowerCase() === idOrNameOrFile.toLowerCase(),
    );
    if (match) {
      scenarioId = match.id || match._id;
    } else {
      printError(
        `Scenario "${idOrNameOrFile}" not found. Run "chanl scenarios list" to see available scenarios.`,
      );
      process.exit(1);
    }
  }

  await executeAndPoll(scenarioId, options, format);
}

async function executeAndPoll(
  scenarioId: string,
  options: {
    agentId?: string;
    personaId?: string;
    scorecardId?: string;
    mode?: string;
    dryRun?: boolean;
    wait?: boolean;
  },
  format?: string,
): Promise<void> {
  const executeDto: Record<string, any> = {};
  if (options.agentId) executeDto.agentId = options.agentId;
  if (options.personaId) executeDto.personaId = options.personaId;
  if (options.scorecardId) executeDto.scorecardId = options.scorecardId;
  if (options.mode) executeDto.mode = options.mode;
  if (options.dryRun) executeDto.dryRun = true;

  const spinner = ora('Starting scenario execution...').start();
  const execResult = await post(
    `/scenarios/${scenarioId}/execute`,
    executeDto,
  );
  const execution = execResult.execution;
  const executionId = execution.executionId || execution.id || execution._id;

  spinner.succeed(`Execution started: ${executionId}`);

  if (options.wait !== false) {
    await pollExecution(executionId, format);
  } else {
    console.log(
      `\nCheck status with: chanl scenarios results ${executionId}`,
    );
  }
}

export function registerScenariosCommand(program: Command): void {
  const scenarios = program
    .command('scenarios')
    .description('Manage evaluation scenarios');

  // --- list ---
  scenarios
    .command('list')
    .description('List all scenarios')
    .option('--status <status>', 'Filter by status')
    .option('--category <category>', 'Filter by category')
    .option('--page <page>', 'Page number', '1')
    .option('--limit <limit>', 'Results per page', '20')
    .action(async (options) => {
      try {
        const params: Record<string, string> = {
          page: options.page,
          limit: options.limit,
        };
        if (options.status) params.status = options.status;
        if (options.category) params.category = options.category;

        const result = await get('/scenarios', params);
        const items = result.scenarios || [];
        const format = program.opts().format;

        const headers = [
          'ID',
          'Name',
          'Category',
          'Difficulty',
          'Status',
          'Personas',
        ];
        const rows = items.map((s: any) => [
          s.id || s._id || '',
          truncate(s.name || '', 30),
          s.category || '',
          s.difficulty || '',
          s.status || '',
          String((s.personaIds || []).length),
        ]);

        printOutput(format, headers, rows, result);

        if (format !== 'json' && result.pagination) {
          const p = result.pagination;
          console.log(
            chalk.dim(
              `\nShowing page ${p.page}/${p.totalPages} (${result.total} total)`,
            ),
          );
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- run ---
  scenarios
    .command('run [idOrFile]')
    .description('Execute a scenario by ID, name, or from a YAML file')
    .option('--agent-id <agentId>', 'Override agent ID')
    .option('--persona-id <personaId>', 'Override persona ID')
    .option('--scorecard-id <scorecardId>', 'Override scorecard ID')
    .option('--mode <mode>', 'Execution mode: text or phone', 'text')
    .option('--dry-run', 'Dry run without actually executing')
    .option('--no-wait', 'Do not wait for completion')
    .option('--all', 'Run all active scenarios')
    .action(async (idOrFile: string | undefined, options) => {
      try {
        await runScenarioAction(idOrFile, options, program.opts().format);
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- create ---
  scenarios
    .command('create')
    .description('Create a new scenario')
    .requiredOption('--name <name>', 'Scenario name')
    .requiredOption('--prompt <prompt>', 'Opening prompt for the persona')
    .option('--description <description>', 'Description')
    .option(
      '--category <category>',
      'Category (support, sales, booking, technical, onboarding, feedback)',
      'support',
    )
    .option('--difficulty <difficulty>', 'Difficulty (easy, medium, hard)', 'medium')
    .option('--persona-ids <ids>', 'Comma-separated persona IDs')
    .option('--agent-ids <ids>', 'Comma-separated agent IDs')
    .option('--scorecard-id <id>', 'Scorecard ID')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--status <status>', 'Status (draft, active)', 'draft')
    .action(async (options) => {
      try {
        const dto: Record<string, any> = {
          name: options.name,
          prompt: options.prompt,
          category: options.category,
          difficulty: options.difficulty,
          status: options.status,
          personaIds: options.personaIds
            ? options.personaIds.split(',').map((s: string) => s.trim())
            : [],
          agentIds: options.agentIds
            ? options.agentIds.split(',').map((s: string) => s.trim())
            : [],
        };

        if (options.description) dto.description = options.description;
        if (options.scorecardId) dto.scorecardId = options.scorecardId;
        if (options.tags)
          dto.tags = options.tags.split(',').map((t: string) => t.trim());

        const result = await post('/scenarios', dto);
        const scenario = result.scenario || result;
        const format = program.opts().format;

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printSuccess(
            `Created scenario: ${scenario.name} (${scenario.id || scenario._id})`,
          );
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- import ---
  scenarios
    .command('import <dirOrFile>')
    .description('Import scenarios from a YAML file or directory')
    .action(async (dirOrFile: string) => {
      try {
        const resolvedPath = path.resolve(dirOrFile);

        if (!fs.existsSync(resolvedPath)) {
          printError(`Path not found: ${resolvedPath}`);
          process.exit(1);
        }

        const stat = fs.statSync(resolvedPath);
        let files: string[];

        if (stat.isDirectory()) {
          files = fs
            .readdirSync(resolvedPath)
            .filter((f: string) => f.endsWith('.yaml') || f.endsWith('.yml'))
            .map((f: string) => path.join(resolvedPath, f));
        } else {
          files = [resolvedPath];
        }

        if (files.length === 0) {
          printError('No YAML files found');
          process.exit(1);
        }

        console.log(`Importing ${files.length} scenario file(s)...\n`);

        let successCount = 0;
        let failCount = 0;

        for (const file of files) {
          const basename = path.basename(file);
          const spinner = ora(`Importing ${basename}...`).start();

          try {
            const yamlContent = fs.readFileSync(file, 'utf-8');
            yaml.load(yamlContent);

            const result = await post('/scenarios/import/yaml', {
              yaml: yamlContent,
            });
            const scenario = result.scenario;
            spinner.succeed(
              `${basename} -> ${scenario.name} (${scenario.id || scenario._id})`,
            );
            successCount++;
          } catch (err) {
            spinner.fail(`${basename}: ${formatError(err)}`);
            failCount++;
          }
        }

        console.log(
          `\nImported: ${chalk.green(String(successCount))} | Failed: ${chalk.red(String(failCount))}`,
        );
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- results ---
  scenarios
    .command('results <executionId>')
    .description('View execution results')
    .action(async (executionId: string) => {
      try {
        const result = await get(`/scenarios/executions/${executionId}`);
        const execution = result.execution;
        const format = program.opts().format;

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        printExecutionDetails(execution);
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });
}

/**
 * Poll an execution until it reaches a terminal state.
 */
async function pollExecution(
  executionId: string,
  format?: string,
): Promise<void> {
  const TERMINAL_STATES = ['completed', 'failed', 'timeout', 'cancelled'];
  const POLL_INTERVAL = 2000;
  const MAX_POLLS = 150;

  const spinner = ora('Waiting for execution to complete...').start();

  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL);

    try {
      const result = await get(`/scenarios/executions/${executionId}`);
      const execution = result.execution;

      spinner.text = `Status: ${execution.status}`;

      if (execution.metrics) {
        const pct = Math.round(
          ((execution.metrics.completedSteps || 0) /
            (execution.metrics.totalSteps || 1)) *
            100,
        );
        spinner.text = `Status: ${execution.status} (${pct}% steps done)`;
      }

      if (TERMINAL_STATES.includes(execution.status)) {
        if (execution.status === 'completed') {
          spinner.succeed('Execution completed');
        } else if (execution.status === 'failed') {
          spinner.fail('Execution failed');
        } else {
          spinner.warn(`Execution ${execution.status}`);
        }

        console.log('');

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printExecutionDetails(execution);
        }
        return;
      }
    } catch (err) {
      spinner.text = `Polling... (${formatError(err)})`;
    }
  }

  spinner.warn('Polling timeout reached');
  console.log(`Check status with: chanl scenarios results ${executionId}`);
}

function printExecutionDetails(execution: any): void {
  const statusColor =
    execution.status === 'completed'
      ? chalk.green
      : execution.status === 'failed'
        ? chalk.red
        : chalk.yellow;

  console.log(chalk.bold('Execution Results'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log(`  ID:       ${execution.executionId || execution.id || ''}`);
  console.log(`  Status:   ${statusColor(execution.status)}`);

  if (
    execution.overallScore !== undefined &&
    execution.overallScore !== null
  ) {
    const scoreColor =
      execution.overallScore >= 80
        ? chalk.green
        : execution.overallScore >= 50
          ? chalk.yellow
          : chalk.red;
    console.log(
      `  Score:    ${scoreColor(execution.overallScore + '/100')}`,
    );
  }

  if (execution.duration) {
    console.log(`  Duration: ${(execution.duration / 1000).toFixed(1)}s`);
  }

  if (execution.startTime) {
    console.log(
      `  Started:  ${new Date(execution.startTime).toLocaleString()}`,
    );
  }

  if (execution.metrics) {
    const m = execution.metrics;
    console.log('');
    console.log(chalk.bold('  Metrics'));
    console.log(chalk.dim('  ' + '─'.repeat(40)));
    if (m.totalSteps) {
      console.log(
        `  Steps:    ${m.completedSteps || 0}/${m.totalSteps} completed, ${m.failedSteps || 0} failed`,
      );
    }
    if (m.responseTime !== undefined) {
      console.log(`  Resp Time: ${m.responseTime}ms`);
    }
    if (m.accuracy !== undefined) {
      console.log(`  Accuracy:  ${m.accuracy}%`);
    }
    if (m.completion !== undefined) {
      console.log(`  Completion: ${m.completion}%`);
    }
  }

  if (execution.errorMessages && execution.errorMessages.length > 0) {
    console.log('');
    console.log(chalk.bold.red('  Errors'));
    console.log(chalk.dim('  ' + '─'.repeat(40)));
    for (const msg of execution.errorMessages) {
      console.log(`  - ${msg}`);
    }
  }

  if (execution.stepResults && execution.stepResults.length > 0) {
    console.log('');
    console.log(chalk.bold('  Step Results'));
    console.log(chalk.dim('  ' + '─'.repeat(40)));
    for (const step of execution.stepResults) {
      const stepStatus =
        step.status === 'completed'
          ? chalk.green(step.status)
          : step.status === 'failed'
            ? chalk.red(step.status)
            : chalk.yellow(step.status);
      const score =
        step.score !== undefined ? ` (${step.score}/100)` : '';
      console.log(`  ${step.stepId}: ${stepStatus}${score}`);
    }
  }
}

/** Convert a name to a URL-friendly slug. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Check if a string looks like a MongoDB ObjectId. */
function isObjectId(str: string): boolean {
  return /^[a-f0-9]{24}$/.test(str);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
