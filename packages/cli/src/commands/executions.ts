import { Command } from 'commander';
import chalk from 'chalk';
import { get, formatError } from '../client';
import { printOutput, printError, truncate } from '../output';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Format a duration in milliseconds to a human-readable string.
 */
function formatDuration(ms: number | undefined | null): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${Math.round(ms / 1000)}s`;
}

/**
 * Format a date string to a relative time like "2 min ago".
 */
function timeAgo(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '-';
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  return `${diffDay}d ago`;
}

/**
 * Shorten an ID to the first 8 characters.
 */
function shortId(id: string | undefined): string {
  if (!id) return '';
  return id.slice(0, 8);
}

/* ------------------------------------------------------------------ */
/* Execution detail printer (reuses patterns from scenarios.ts)        */
/* ------------------------------------------------------------------ */

function printExecutionDetails(execution: any): void {
  const statusColor =
    execution.status === 'completed'
      ? chalk.green
      : execution.status === 'failed'
        ? chalk.red
        : chalk.yellow;

  console.log(chalk.bold('Execution Details'));
  console.log(chalk.dim('\u2500'.repeat(60)));
  console.log(
    `  ID:         ${execution.executionId || execution.id || execution._id || ''}`,
  );
  console.log(`  Scenario:   ${execution.scenarioId || '-'}`);
  console.log(`  Status:     ${statusColor(execution.status)}`);

  if (execution.duration) {
    console.log(
      `  Duration:   ${formatDuration(execution.duration)}`,
    );
  }

  if (execution.overallScore !== undefined && execution.overallScore !== null) {
    const score = Math.round(execution.overallScore);
    const scoreColor =
      score >= 80
        ? chalk.green
        : score >= 50
          ? chalk.yellow
          : chalk.red;
    console.log(`  Score:      ${scoreColor(`${score}/100`)}`);
  }

  if (execution.startTime) {
    console.log(
      `  Started:    ${new Date(execution.startTime).toLocaleString()}`,
    );
  }
  if (execution.endTime) {
    console.log(
      `  Ended:      ${new Date(execution.endTime).toLocaleString()}`,
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
      const lines = wordWrap(text, 68);
      for (const line of lines) {
        console.log(`    ${line}`);
      }
      console.log('');
    }
  }

  // -- Scorecard criteria ------------------------------------------------
  if (execution.criteriaResults && Array.isArray(execution.criteriaResults)) {
    console.log(chalk.bold('  Scorecard'));
    console.log(chalk.dim('  ' + '\u2500'.repeat(52)));
    for (const cr of execution.criteriaResults) {
      const icon = cr.passed ? chalk.green('\u2713') : chalk.red('\u2717');
      const nameStr = cr.criteriaName || cr.criteriaKey || 'criterion';
      const scoreStr =
        cr.result !== undefined ? chalk.dim(` (${cr.result})`) : '';
      console.log(`  ${icon} ${nameStr}${scoreStr}`);
      if (cr.reasoning) {
        console.log(`    ${chalk.dim(truncate(cr.reasoning, 60))}`);
      }
    }
    console.log('');
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
}

/**
 * Simple word wrap.
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

/* ------------------------------------------------------------------ */
/* Command registration                                                */
/* ------------------------------------------------------------------ */

export function registerExecutionsCommand(program: Command): void {
  const executions = program
    .command('executions')
    .description('Browse and inspect scenario execution results');

  // --- list ---
  executions
    .command('list')
    .description('List recent executions')
    .option('--scenario <scenario>', 'Filter by scenario ID or slug')
    .option('--status <status>', 'Filter by status (completed, failed, etc.)')
    .option('--limit <limit>', 'Number of results', '20')
    .option('--page <page>', 'Page number', '1')
    .action(async (options) => {
      try {
        const params: Record<string, string> = {
          limit: options.limit,
          page: options.page,
        };
        if (options.scenario) params.scenarioId = options.scenario;
        if (options.status) params.status = options.status;

        const result = await get('/scenarios/executions', params);
        const items = result.executions || [];
        const total = result.total || items.length;
        const format = program.opts().format;

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (items.length === 0) {
          console.log(chalk.dim('No executions found.'));
          return;
        }

        console.log(
          chalk.dim(
            `\nRecent executions (${items.length} of ${total})\n`,
          ),
        );

        const headers = [
          'ID',
          'Scenario',
          'Score',
          'Status',
          'Duration',
          'Date',
        ];
        const rows = items.map((e: any) => {
          const id = shortId(e.executionId || e.id || e._id);
          const scenario = truncate(e.scenarioId || '-', 24);
          const score =
            e.overallScore !== undefined && e.overallScore !== null
              ? String(Math.round(e.overallScore))
              : '-';
          const status = e.status || '-';
          const duration = formatDuration(e.duration);
          const date = timeAgo(e.endTime || e.startTime || e.createdAt);

          return [id, scenario, score, status, duration, date];
        });

        printOutput(format, headers, rows, result);

        if (result.pagination) {
          const p = result.pagination;
          console.log(
            chalk.dim(
              `\nPage ${p.page || 1}/${p.totalPages || 1} (${total} total)`,
            ),
          );
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- show ---
  executions
    .command('show <executionId>')
    .description('Show full details of an execution (transcript + scorecard)')
    .action(async (executionId: string) => {
      try {
        const result = await get(`/scenarios/executions/${executionId}`);
        const execution = result.execution || result;
        const format = program.opts().format;

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        printExecutionDetails(execution);
        console.log('');
        console.log(
          chalk.dim('chanl-eval — chanl.ai/eval | linkedin.com/company/chanl-ai'),
        );
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });
}
