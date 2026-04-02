import { Command } from 'commander';
import { get, post, del, formatError } from '../client';
import { printOutput, printSuccess, printError, truncate } from '../output';

export function registerScorecardsCommand(program: Command): void {
  const scorecards = program
    .command('scorecards')
    .description('Manage scorecards');

  // --- list ---
  scorecards
    .command('list')
    .description('List all scorecards')
    .option('--status <status>', 'Filter by status')
    .option('--page <page>', 'Page number', '1')
    .option('--limit <limit>', 'Results per page', '20')
    .action(async (options) => {
      try {
        const params: Record<string, string> = {
          page: options.page,
          limit: options.limit,
        };
        if (options.status) params.status = options.status;

        const result = await get('/scorecards', params);
        const items = result.scorecards || [];
        const format = program.opts().format;

        const headers = ['ID', 'Name', 'Status', 'Threshold', 'Algorithm', 'Tags'];
        const rows = items.map((sc: any) => [
          sc.id || sc._id || '',
          truncate(sc.name || '', 30),
          sc.status || '',
          sc.passingThreshold !== undefined ? String(sc.passingThreshold) : '-',
          sc.scoringAlgorithm || '-',
          (sc.tags || []).join(', ') || '-',
        ]);

        printOutput(format, headers, rows, result);

        if (format !== 'json' && result.pagination) {
          const pg = result.pagination;
          console.log(
            `\nShowing page ${pg.page}/${pg.totalPages} (${result.total} total)`,
          );
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- create ---
  scorecards
    .command('create')
    .description('Create a new scorecard')
    .requiredOption('--name <name>', 'Scorecard name')
    .option('--description <description>', 'Description')
    .option('--status <status>', 'Status (active, inactive, draft)', 'active')
    .option('--threshold <threshold>', 'Passing threshold (0-100)', '70')
    .option(
      '--algorithm <algorithm>',
      'Scoring algorithm (weighted_average, simple_average, minimum_all, pass_fail)',
      'weighted_average',
    )
    .option('--tags <tags>', 'Comma-separated tags')
    .option(
      '--from-template <template>',
      'Create from a template name (e.g., customer-service)',
    )
    .action(async (options) => {
      try {
        const dto: Record<string, any> = {
          name: options.name,
          status: options.status,
          passingThreshold: parseInt(options.threshold, 10),
          scoringAlgorithm: options.algorithm,
        };

        if (options.description) dto.description = options.description;
        if (options.tags) dto.tags = options.tags.split(',').map((t: string) => t.trim());

        // If a template name is given, use the template name as a convention
        // The server will use it in the future; for now we set a sensible default
        if (options.fromTemplate) {
          dto.name = dto.name || formatTemplateName(options.fromTemplate);
          dto.tags = dto.tags || [options.fromTemplate];
        }

        const result = await post('/scorecards', dto);
        const scorecard = result.scorecard;
        const format = program.opts().format;

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printSuccess(
            `Created scorecard: ${scorecard.name} (${scorecard.id || scorecard._id})`,
          );
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- get ---
  scorecards
    .command('get <id>')
    .description('Get scorecard details')
    .action(async (id: string) => {
      try {
        const result = await get(`/scorecards/${id}`);
        const format = program.opts().format;

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const sc = result.scorecard;
          console.log(`Name:       ${sc.name}`);
          console.log(`ID:         ${sc.id || sc._id}`);
          console.log(`Status:     ${sc.status}`);
          console.log(`Threshold:  ${sc.passingThreshold}`);
          console.log(`Algorithm:  ${sc.scoringAlgorithm}`);
          if (sc.description) {
            console.log(`Description: ${sc.description}`);
          }
          if (sc.tags && sc.tags.length > 0) {
            console.log(`Tags:       ${sc.tags.join(', ')}`);
          }
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- delete ---
  scorecards
    .command('delete <id>')
    .description('Delete a scorecard')
    .option('--force', 'Skip confirmation prompt')
    .action(async (id: string, options) => {
      try {
        if (!options.force) {
          const inquirer = await import('inquirer');
          const answers = await inquirer.default.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Delete scorecard ${id}?`,
              default: false,
            },
          ]);
          if (!answers.confirm) {
            console.log('Cancelled.');
            return;
          }
        }

        await del(`/scorecards/${id}`);
        printSuccess(`Deleted scorecard: ${id}`);
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- default ---
  scorecards
    .command('default')
    .description('Get the default scorecard')
    .action(async () => {
      try {
        const result = await get('/scorecards/default');
        const format = program.opts().format;

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const data = result.data;
          const sc = data.scorecard;
          console.log(`Default Scorecard: ${sc.name} (${sc.id || sc._id})`);
          console.log(`Source: ${data.source}`);
          console.log(`Status: ${sc.status}`);
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });
}

/**
 * Format a template slug into a display name.
 */
function formatTemplateName(template: string): string {
  return template
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ') + ' Scorecard';
}
