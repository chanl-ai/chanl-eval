import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import { createClient, get, post, formatError } from '../client';
import { printError, printSuccess } from '../output';

/**
 * Register the `chanl dataset` command group.
 */
export function registerDatasetCommand(program: Command): void {
  const dataset = program
    .command('dataset')
    .description('Generate and export training datasets from conversation executions');

  // ── generate ──────────────────────────────────────────────────────
  dataset
    .command('generate')
    .description('Generate a batch of conversations for dataset creation')
    .requiredOption('--scenario <id>', 'Scenario ID')
    .requiredOption('--prompt-id <id>', 'Prompt ID (the agent under test)')
    .option('--personas <ids>', 'Comma-separated persona IDs (default: all linked personas)')
    .option('--count <n>', 'Number of conversations to generate', parseInt)
    .option('--wait', 'Wait for batch to complete')
    .option('--export <format>', 'Export after completion (openai, openai-tools, sharegpt)')
    .option('--output <path>', 'Output file path for export')
    .option('--min-score <n>', 'Minimum score for export filter', parseInt)
    .action(async (options) => {
      try {
        const body: any = {
          scenarioId: options.scenario,
          promptId: options.promptId,
        };
        if (options.personas) {
          body.personaIds = options.personas.split(',').map((s: string) => s.trim());
        }
        if (options.count) {
          body.count = options.count;
        }

        const spinner = ora('Creating batch...').start();
        const result: any = await post('/datasets/generate', body);
        spinner.stop();

        printSuccess(`Batch ${chalk.bold(result.batchId)} created with ${result.total} executions`);

        if (options.wait || options.export) {
          await waitForBatch(result.batchId);
        }

        if (options.export) {
          await exportToFile(
            options.export,
            options.output || `dataset-${options.export}-${Date.now()}.jsonl`,
            { batchId: result.batchId, minScore: options.minScore },
          );
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // ── status ────────────────────────────────────────────────────────
  dataset
    .command('status <batchId>')
    .description('Check the status of a batch generation')
    .action(async (batchId) => {
      try {
        const result: any = await get(`/datasets/generate/${batchId}/status`);
        const statusColor =
          result.status === 'completed' ? chalk.green :
          result.status === 'failed' ? chalk.red :
          chalk.yellow;

        console.log(chalk.bold('Batch Status'));
        console.log(chalk.dim('─'.repeat(40)));
        console.log(`  Batch:     ${result.batchId}`);
        console.log(`  Status:    ${statusColor(result.status)}`);
        console.log(`  Total:     ${result.total}`);
        console.log(`  Completed: ${chalk.green(result.completed)}`);
        console.log(`  Failed:    ${result.failed > 0 ? chalk.red(result.failed) : result.failed}`);
        console.log(`  Running:   ${result.running}`);
        console.log(`  Queued:    ${result.queued}`);
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // ── export ────────────────────────────────────────────────────────
  dataset
    .command('export')
    .description('Export completed executions as training data')
    .requiredOption('--format <format>', 'Export format: openai, openai-tools, sharegpt, dpo')
    .option('--output <path>', 'Output file path (default: stdout)')
    .option('--scenario <ids>', 'Comma-separated scenario IDs to filter')
    .option('--persona <ids>', 'Comma-separated persona IDs to filter')
    .option('--min-score <n>', 'Minimum scorecard score (0-100)', parseInt)
    .option('--batch <id>', 'Filter by batch ID')
    .option('--system-prompt <prompt>', 'Override system prompt in training data')
    .action(async (options) => {
      try {
        const outputPath = options.output;

        await exportToFile(
          options.format,
          outputPath,
          {
            scenarioIds: options.scenario?.split(','),
            personaIds: options.persona?.split(','),
            minScore: options.minScore,
            batchId: options.batch,
          },
          options.systemPrompt,
        );
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // ── preview ───────────────────────────────────────────────────────
  dataset
    .command('preview')
    .description('Preview what an export would contain')
    .option('--format <format>', 'Export format', 'openai')
    .option('--scenario <ids>', 'Comma-separated scenario IDs')
    .option('--min-score <n>', 'Minimum score', parseInt)
    .option('--batch <id>', 'Filter by batch ID')
    .action(async (options) => {
      try {
        const params: any = { format: options.format };
        if (options.scenario) params.scenarioIds = options.scenario;
        if (options.minScore) params.minScore = options.minScore;
        if (options.batch) params.batchId = options.batch;

        const result: any = await get('/datasets/export/preview', params);

        console.log(chalk.bold('Export Preview'));
        console.log(chalk.dim('─'.repeat(40)));
        console.log(`  Format:     ${result.format}`);
        console.log(`  Count:      ${chalk.bold(result.count)} conversations`);
        console.log(`  Avg Score:  ${result.avgScore}`);

        if (result.sampleLine) {
          console.log();
          console.log(chalk.dim('Sample line:'));
          const pretty = JSON.stringify(JSON.parse(result.sampleLine), null, 2);
          console.log(chalk.gray(pretty.slice(0, 500) + (pretty.length > 500 ? '...' : '')));
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });
}

// ── Helpers ───────────────────────────────────────────────────────────

async function waitForBatch(batchId: string): Promise<void> {
  const spinner = ora('Waiting for batch to complete...').start();
  const pollInterval = 3000;
  const maxPolls = 200; // ~10 minutes

  for (let i = 0; i < maxPolls; i++) {
    const status: any = await get(`/datasets/generate/${batchId}/status`);
    spinner.text = `Batch: ${status.completed}/${status.total} completed`;

    if (status.status !== 'running') {
      spinner.stop();
      if (status.status === 'completed') {
        printSuccess(`Batch completed: ${status.completed}/${status.total} conversations`);
      } else {
        console.log(chalk.yellow(`Batch ${status.status}: ${status.completed} completed, ${status.failed} failed`));
      }
      return;
    }

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  spinner.stop();
  console.log(chalk.yellow('Timed out waiting for batch. Check status with: chanl dataset status ' + batchId));
}

async function exportToFile(
  format: string,
  outputPath: string | undefined,
  filters: {
    scenarioIds?: string[];
    personaIds?: string[];
    minScore?: number;
    batchId?: string;
  },
  systemPrompt?: string,
): Promise<void> {
  const spinner = ora('Exporting dataset...').start();

  const client = createClient();
  const response = await client.post('/datasets/export', {
    format,
    filters,
    options: systemPrompt ? { systemPrompt } : undefined,
  }, {
    responseType: 'text',
    timeout: 300_000, // 5 min for large exports
  });

  spinner.stop();

  const data = response.data as string;
  const lineCount = data.split('\n').filter(Boolean).length;

  if (outputPath) {
    fs.writeFileSync(outputPath, data);
    printSuccess(`Exported ${lineCount} examples to ${chalk.bold(outputPath)} (${format} format)`);
  } else {
    // Write to stdout
    process.stdout.write(data);
  }
}
