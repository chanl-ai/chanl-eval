import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import chalk from 'chalk';
import ora from 'ora';
import { get, post, formatError } from '../client';
import { printOutput, printSuccess, printError, truncate } from '../output';

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

        const headers = ['ID', 'Name', 'Category', 'Difficulty', 'Status', 'Personas'];
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
            chalk.dim(`\nShowing page ${p.page}/${p.totalPages} (${result.total} total)`),
          );
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- run ---
  scenarios
    .command('run <idOrFile>')
    .description('Execute a scenario by ID or from a YAML file')
    .option('--agent-id <agentId>', 'Override agent ID')
    .option('--persona-id <personaId>', 'Override persona ID')
    .option('--scorecard-id <scorecardId>', 'Override scorecard ID')
    .option('--mode <mode>', 'Execution mode: text or phone', 'text')
    .option('--dry-run', 'Dry run without actually executing')
    .option('--no-wait', 'Do not wait for completion')
    .action(async (idOrFile: string, options) => {
      try {
        let scenarioId = idOrFile;

        // Check if the argument is a YAML file path
        if (idOrFile.endsWith('.yaml') || idOrFile.endsWith('.yml')) {
          const filePath = path.resolve(idOrFile);
          if (!fs.existsSync(filePath)) {
            printError(`File not found: ${filePath}`);
            process.exit(1);
          }

          const spinner = ora('Importing scenario from YAML...').start();
          try {
            const yamlContent = fs.readFileSync(filePath, 'utf-8');
            // Validate it is valid YAML
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
        }

        // Build execution payload
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

        // Poll for completion unless --no-wait
        if (options.wait !== false) {
          await pollExecution(executionId, program.opts().format);
        } else {
          console.log(`\nCheck status with: chanl scenarios results ${executionId}`);
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
            .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
            .map((f) => path.join(resolvedPath, f));
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
            yaml.load(yamlContent); // validate

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
async function pollExecution(executionId: string, format?: string): Promise<void> {
  const TERMINAL_STATES = ['completed', 'failed', 'timeout', 'cancelled'];
  const POLL_INTERVAL = 2000; // 2 seconds
  const MAX_POLLS = 150; // 5 minutes

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
      // Transient errors during polling are OK, keep going
      spinner.text = `Polling... (${formatError(err)})`;
    }
  }

  spinner.warn('Polling timeout reached');
  console.log(`Check status with: chanl scenarios results ${executionId}`);
}

/**
 * Print execution details in a human-readable format.
 */
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

  if (execution.overallScore !== undefined && execution.overallScore !== null) {
    const scoreColor =
      execution.overallScore >= 80
        ? chalk.green
        : execution.overallScore >= 50
          ? chalk.yellow
          : chalk.red;
    console.log(`  Score:    ${scoreColor(execution.overallScore + '/100')}`);
  }

  if (execution.duration) {
    console.log(`  Duration: ${(execution.duration / 1000).toFixed(1)}s`);
  }

  if (execution.startTime) {
    console.log(`  Started:  ${new Date(execution.startTime).toLocaleString()}`);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
