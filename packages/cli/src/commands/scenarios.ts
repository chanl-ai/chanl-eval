import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import chalk from 'chalk';
import ora from 'ora';
import { get, post, patch, del, formatError } from '../client';
import { printOutput, printSuccess, printError, truncate } from '../output';

/**
 * Shared run action — used by both `chanl scenarios run` and `chanl run`.
 */
export async function runScenarioAction(
  idOrNameOrFile: string | undefined,
  options: {
    promptId?: string;
    personaId?: string;
    scorecardId?: string;
    mode?: string;
    dryRun?: boolean;
    wait?: boolean;
    all?: boolean;
    tools?: string;
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
    promptId?: string;
    personaId?: string;
    scorecardId?: string;
    mode?: string;
    dryRun?: boolean;
    wait?: boolean;
    tools?: string;
  },
  format?: string,
): Promise<void> {
  const executeDto: Record<string, any> = {};

  // promptId is required — the Prompt entity + server Settings are the only config source
  if (!options.promptId) {
    const msg =
      'Missing --prompt-id. The server resolves adapter config from the Prompt entity.\n' +
      'Create a prompt in the dashboard or via the API, then pass its ID:\n' +
      '  chanl scenarios run <scenario> --prompt-id <id>';
    printError(msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
  executeDto.promptId = options.promptId;

  if (options.personaId) executeDto.personaId = options.personaId;
  if (options.scorecardId) executeDto.scorecardId = options.scorecardId;
  if (options.mode) executeDto.mode = options.mode;
  if (options.dryRun) executeDto.dryRun = true;
  if (options.tools) {
    executeDto.toolFixtureIds = options.tools
      .split(',')
      .map((id: string) => id.trim())
      .filter(Boolean);
  }

  console.log(chalk.dim(`Using prompt: ${options.promptId}`));

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
    .requiredOption('--prompt-id <promptId>', 'Prompt entity ID (defines the agent under test)')
    .option('--persona-id <personaId>', 'Override persona ID')
    .option('--scorecard-id <scorecardId>', 'Override scorecard ID')
    .option('--tools <ids>', 'Comma-separated tool fixture IDs to attach')
    .option('--mode <mode>', 'Execution mode: text or phone', 'text')
    .option('--dry-run', 'Dry run without actually executing')
    .option('--no-wait', 'Do not wait for completion')
    .option('--all', 'Run all active scenarios')
    .action(async (idOrFile: string | undefined, options) => {
      try {
        await runScenarioAction(idOrFile, options, program.opts().format);
      } catch (err) {
        printError(formatError(err));
        process.exitCode = 1;
        throw err;
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

  // --- get ---
  scenarios
    .command('get <id>')
    .description('Get scenario details')
    .action(async (id: string) => {
      try {
        const result = await get(`/scenarios/${id}`);
        const format = program.opts().format;

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const s = result.scenario;
          console.log(`Name:        ${s.name}`);
          console.log(`ID:          ${s.id || s._id}`);
          console.log(`Category:    ${s.category || '-'}`);
          console.log(`Difficulty:  ${s.difficulty || '-'}`);
          console.log(`Status:      ${s.status || '-'}`);
          console.log(`Personas:    ${(s.personaIds || []).length}`);
          if (s.description) {
            console.log(`Description: ${s.description}`);
          }
          if (s.prompt) {
            console.log(`Prompt:      ${truncate(s.prompt, 80)}`);
          }
          if (s.tags && s.tags.length > 0) {
            console.log(`Tags:        ${s.tags.join(', ')}`);
          }
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- update ---
  scenarios
    .command('update <id>')
    .description('Update a scenario')
    .option('--name <name>', 'New name')
    .option('--description <description>', 'New description')
    .option('--prompt <prompt>', 'New opening prompt')
    .option('--category <category>', 'New category')
    .option('--difficulty <difficulty>', 'New difficulty')
    .option('--status <status>', 'New status (draft, active)')
    .option('--persona-ids <ids>', 'Comma-separated persona IDs')
    .option('--scorecard-id <id>', 'New scorecard ID')
    .option('--tags <tags>', 'Comma-separated tags')
    .action(async (id: string, options) => {
      try {
        const dto: Record<string, any> = {};
        if (options.name) dto.name = options.name;
        if (options.description) dto.description = options.description;
        if (options.prompt) dto.prompt = options.prompt;
        if (options.category) dto.category = options.category;
        if (options.difficulty) dto.difficulty = options.difficulty;
        if (options.status) dto.status = options.status;
        if (options.scorecardId) dto.scorecardId = options.scorecardId;
        if (options.personaIds) {
          dto.personaIds = options.personaIds.split(',').map((s: string) => s.trim());
        }
        if (options.tags) {
          dto.tags = options.tags.split(',').map((t: string) => t.trim());
        }

        const result = await patch(`/scenarios/${id}`, dto);
        const scenario = result.scenario || result;
        const format = program.opts().format;

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printSuccess(
            `Updated scenario: ${scenario.name} (${scenario.id || scenario._id})`,
          );
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- delete ---
  scenarios
    .command('delete <id>')
    .description('Delete a scenario')
    .option('--force', 'Skip confirmation prompt')
    .action(async (id: string, options) => {
      try {
        if (!options.force) {
          const inquirer = await import('inquirer');
          const answers = await inquirer.default.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Delete scenario ${id}?`,
              default: false,
            },
          ]);
          if (!answers.confirm) {
            console.log('Cancelled.');
            return;
          }
        }

        await del(`/scenarios/${id}`);
        printSuccess(`Deleted scenario: ${id}`);
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
  console.log(chalk.dim('\u2500'.repeat(60)));
  console.log(`  ID:       ${execution.executionId || execution.id || ''}`);
  console.log(`  Status:   ${statusColor(execution.status)}`);

  if (execution.duration) {
    console.log(`  Duration: ${(execution.duration / 1000).toFixed(1)}s`);
  }

  if (execution.startTime) {
    console.log(
      `  Started:  ${new Date(execution.startTime).toLocaleString()}`,
    );
  }

  // -- Transcript --------------------------------------------------------
  if (execution.stepResults && execution.stepResults.length > 0) {
    console.log('');
    console.log(chalk.bold('  Transcript'));
    console.log(chalk.dim('  ' + '\u2500'.repeat(52)));
    for (const step of execution.stepResults) {
      const text = step.actualResponse;
      if (!text) continue;
      const isAgent =
        typeof step.stepId === 'string' && step.stepId.includes('agent');
      const label = isAgent
        ? chalk.cyan.bold('Agent')
        : chalk.magenta.bold('Persona');
      const latencyTag =
        isAgent && step.duration
          ? chalk.dim(` [${step.duration}ms]`)
          : '';
      console.log(`  ${label}${latencyTag}`);
      // Wrap text at ~68 chars, indented
      const lines = wordWrap(text, 68);
      for (const line of lines) {
        console.log(`    ${line}`);
      }
      console.log('');
    }
  }

  // -- Score with visual bar ---------------------------------------------
  if (
    execution.overallScore !== undefined &&
    execution.overallScore !== null
  ) {
    console.log(chalk.bold('  Score'));
    console.log(chalk.dim('  ' + '\u2500'.repeat(52)));
    const score = Math.round(execution.overallScore);
    const scoreColor =
      score >= 80
        ? chalk.green
        : score >= 50
          ? chalk.yellow
          : chalk.red;
    const bar = buildScoreBar(score, 20);
    console.log(`  ${scoreColor(`${score}/100`)} ${bar}`);
    console.log('');
  }

  // -- Scorecard criteria results ----------------------------------------
  const criteriaResults = extractCriteriaResults(execution);
  if (criteriaResults.length > 0) {
    console.log(chalk.bold('  Scorecard'));
    console.log(chalk.dim('  ' + '\u2500'.repeat(52)));
    for (const cr of criteriaResults) {
      const icon = cr.passed ? chalk.green('\u2713') : chalk.red('\u2717');
      const nameStr = cr.name || cr.key || 'criterion';
      const typeStr = cr.type ? chalk.dim(` [${cr.type}]`) : '';
      const scoreStr =
        cr.score !== undefined && cr.score !== null
          ? chalk.dim(` (${cr.score})`)
          : '';
      const reasonStr = cr.reasoning
        ? chalk.dim(`  ${truncate(cr.reasoning, 60)}`)
        : '';
      console.log(`  ${icon} ${nameStr}${typeStr}${scoreStr}`);
      if (reasonStr) {
        console.log(`  ${reasonStr}`);
      }
    }
    console.log('');
  }

  // -- Latency stats -----------------------------------------------------
  const latencyStats = computeLatencyStats(execution);
  if (latencyStats) {
    console.log(chalk.bold('  Latency'));
    console.log(chalk.dim('  ' + '\u2500'.repeat(52)));
    console.log(
      `  Avg response:  ${chalk.cyan(latencyStats.avg + 'ms')}`,
    );
    console.log(
      `  Slowest turn:  ${chalk.yellow(latencyStats.max + 'ms')}${latencyStats.slowestTurn ? chalk.dim(` (turn ${latencyStats.slowestTurn})`) : ''}`,
    );
    if (latencyStats.min !== latencyStats.max) {
      console.log(
        `  Fastest turn:  ${chalk.green(latencyStats.min + 'ms')}`,
      );
    }
    console.log(`  Total turns:   ${latencyStats.count}`);
    console.log('');
  }

  // -- Metrics -----------------------------------------------------------
  if (execution.metrics) {
    const m = execution.metrics;
    const hasMetrics =
      m.totalSteps || m.accuracy !== undefined || m.completion !== undefined;
    if (hasMetrics) {
      console.log(chalk.bold('  Metrics'));
      console.log(chalk.dim('  ' + '\u2500'.repeat(52)));
      if (m.totalSteps) {
        console.log(
          `  Steps:      ${m.completedSteps || 0}/${m.totalSteps} completed, ${m.failedSteps || 0} failed`,
        );
      }
      if (m.accuracy !== undefined) {
        console.log(`  Accuracy:   ${m.accuracy}%`);
      }
      if (m.completion !== undefined) {
        console.log(`  Completion: ${m.completion}%`);
      }
      console.log('');
    }
  }

  // -- Errors ------------------------------------------------------------
  if (execution.errorMessages && execution.errorMessages.length > 0) {
    console.log(chalk.bold.red('  Errors'));
    console.log(chalk.dim('  ' + '\u2500'.repeat(52)));
    for (const msg of execution.errorMessages) {
      console.log(`  ${chalk.red('\u2717')} ${msg}`);
    }
    console.log('');
  }

  // -- Cloud teaser (subtle, one line) -----------------------------------
  console.log(
    chalk.dim(
      '  \u{1F4A1} chanl cloud \u2192 dashboard, voice testing, trends \u2192 chanl.ai',
    ),
  );
}

/**
 * Build a visual score bar using block characters.
 * Filled blocks for the score portion, light shade for the remainder.
 */
function buildScoreBar(score: number, width: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  const filledChar = '\u2588'; // full block
  const emptyChar = '\u2591'; // light shade

  const bar = filledChar.repeat(filled) + emptyChar.repeat(empty);
  if (score >= 80) return chalk.green(bar);
  if (score >= 50) return chalk.yellow(bar);
  return chalk.red(bar);
}

/**
 * Compute latency statistics from agent response times in stepResults.
 */
function computeLatencyStats(
  execution: any,
): {
  avg: number;
  max: number;
  min: number;
  count: number;
  slowestTurn: number | null;
} | null {
  if (!execution.stepResults || execution.stepResults.length === 0) {
    return null;
  }

  const agentSteps = execution.stepResults.filter(
    (s: any) =>
      typeof s.stepId === 'string' &&
      s.stepId.includes('agent') &&
      s.duration > 0,
  );

  if (agentSteps.length === 0) return null;

  let total = 0;
  let max = 0;
  let min = Infinity;
  let slowestTurn: number | null = null;

  for (const step of agentSteps) {
    const d = step.duration;
    total += d;
    if (d > max) {
      max = d;
      // Extract turn number from stepId like "turn-2-agent"
      const match = step.stepId.match(/turn-(\d+)/);
      slowestTurn = match ? parseInt(match[1], 10) + 1 : null;
    }
    if (d < min) {
      min = d;
    }
  }

  return {
    avg: Math.round(total / agentSteps.length),
    max,
    min: min === Infinity ? 0 : min,
    count: agentSteps.length,
    slowestTurn,
  };
}

/**
 * Extract scorecard criteria results from execution data.
 * Criteria results may be present at the top level (if the API enriches the response)
 * or nested in execution metadata.
 */
function extractCriteriaResults(
  execution: any,
): Array<{
  name: string;
  key: string;
  type?: string;
  score?: number;
  passed: boolean;
  reasoning?: string;
}> {
  // Top-level criteriaResults (if API returns enriched data)
  if (execution.criteriaResults && Array.isArray(execution.criteriaResults)) {
    return execution.criteriaResults.map((cr: any) => ({
      name: cr.criteriaName || cr.criteriaKey || '',
      key: cr.criteriaKey || '',
      type: cr.type,
      score: typeof cr.result === 'number' ? cr.result : undefined,
      passed: !!cr.passed,
      reasoning: cr.reasoning,
    }));
  }

  // Nested in metadata (if execution processor stored them)
  if (execution.metadata?.scorecardResult?.criteriaResults) {
    return execution.metadata.scorecardResult.criteriaResults.map(
      (cr: any) => ({
        name: cr.criteriaName || cr.criteriaKey || '',
        key: cr.criteriaKey || '',
        type: cr.type,
        score: typeof cr.result === 'number' ? cr.result : undefined,
        passed: !!cr.passed,
        reasoning: cr.reasoning,
      }),
    );
  }

  return [];
}

/**
 * Simple word wrap for transcript display.
 */
function wordWrap(text: string, maxWidth: number): string[] {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (
      currentLine.length + word.length + 1 > maxWidth &&
      currentLine.length > 0
    ) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [''];
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
