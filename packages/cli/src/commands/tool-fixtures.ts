import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { get, post, patch, del, formatError } from '../client';
import { printOutput, printSuccess, printError, truncate } from '../output';

export function registerToolFixturesCommand(program: Command): void {
  const toolFixtures = program
    .command('tool-fixtures')
    .description('Manage tool fixtures (mock tools for scenario testing)');

  // --- list ---
  toolFixtures
    .command('list')
    .description('List all tool fixtures')
    .option('--active', 'Show only active fixtures')
    .option('--inactive', 'Show only inactive fixtures')
    .option('--tags <tags>', 'Filter by tags (comma-separated)')
    .option('--search <query>', 'Search by name or description')
    .option('--page <page>', 'Page number', '1')
    .option('--limit <limit>', 'Results per page', '20')
    .action(async (options) => {
      try {
        const params: Record<string, string> = {
          page: options.page,
          limit: options.limit,
        };
        if (options.active) params.isActive = 'true';
        if (options.inactive) params.isActive = 'false';
        if (options.tags) params.tags = options.tags;
        if (options.search) params.search = options.search;

        const result = await get('/tool-fixtures', params);
        const items = result.toolFixtures || [];
        const format = program.opts().format;

        const headers = [
          'ID',
          'Name',
          'Description',
          'Params',
          'Mocks',
          'Active',
          'Tags',
        ];
        const rows = items.map((tf: any) => [
          tf.id || tf._id || '',
          truncate(tf.name || '', 25),
          truncate(tf.description || '', 30),
          String(Object.keys(tf.parameters || {}).length),
          String((tf.mockResponses || []).length),
          tf.isActive ? chalk.green('Yes') : chalk.dim('No'),
          (tf.tags || []).join(', ') || '-',
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

  // --- get ---
  toolFixtures
    .command('get <id>')
    .description('Get tool fixture details')
    .action(async (id: string) => {
      try {
        const result = await get(`/tool-fixtures/${id}`);
        const format = program.opts().format;

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        const tf = result.toolFixture || result;

        console.log(chalk.bold('Tool Fixture'));
        console.log(chalk.dim('\u2500'.repeat(60)));
        console.log(`  Name:        ${tf.name}`);
        console.log(`  ID:          ${tf.id || tf._id}`);
        console.log(
          `  Active:      ${tf.isActive ? chalk.green('Yes') : chalk.dim('No')}`,
        );
        if (tf.description) {
          console.log(`  Description: ${tf.description}`);
        }
        if (tf.tags && tf.tags.length > 0) {
          console.log(`  Tags:        ${tf.tags.join(', ')}`);
        }

        // Parameters
        if (tf.parameters && Object.keys(tf.parameters).length > 0) {
          console.log('');
          console.log(chalk.bold('  Parameters'));
          console.log(chalk.dim('  ' + '\u2500'.repeat(52)));
          console.log(
            formatJsonIndented(tf.parameters, 4),
          );
        }

        // Mock responses
        if (tf.mockResponses && tf.mockResponses.length > 0) {
          console.log('');
          console.log(chalk.bold('  Mock Responses'));
          console.log(chalk.dim('  ' + '\u2500'.repeat(52)));
          for (let i = 0; i < tf.mockResponses.length; i++) {
            const mock = tf.mockResponses[i];
            const label = mock.isDefault
              ? chalk.yellow('Default')
              : `Rule ${i + 1}`;
            const desc = mock.description
              ? chalk.dim(` - ${mock.description}`)
              : '';
            console.log(`  ${label}${desc}`);

            if (mock.when && Object.keys(mock.when).length > 0) {
              console.log(
                `    ${chalk.dim('When:')} ${JSON.stringify(mock.when)}`,
              );
            }
            console.log(
              `    ${chalk.dim('Return:')} ${JSON.stringify(mock.return)}`,
            );
            console.log('');
          }
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- create ---
  toolFixtures
    .command('create')
    .description('Create a new tool fixture')
    .requiredOption('--name <name>', 'Tool fixture name')
    .requiredOption('--description <description>', 'Description of the tool')
    .option('--file <path>', 'Load full definition from a JSON or YAML file')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--inactive', 'Create as inactive')
    .action(async (options) => {
      try {
        let dto: Record<string, any> = {
          name: options.name,
          description: options.description,
        };

        // If --file is provided, merge the file contents
        if (options.file) {
          const filePath = path.resolve(options.file);
          if (!fs.existsSync(filePath)) {
            printError(`File not found: ${filePath}`);
            process.exit(1);
          }

          const content = fs.readFileSync(filePath, 'utf-8');
          let fileData: any;

          if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
            fileData = yaml.load(content);
          } else {
            fileData = JSON.parse(content);
          }

          // File data merges with CLI options (CLI options take precedence for name/description)
          dto = { ...fileData, ...dto };
        }

        if (options.tags) {
          dto.tags = options.tags.split(',').map((t: string) => t.trim());
        }
        if (options.inactive) {
          dto.isActive = false;
        }

        const result = await post('/tool-fixtures', dto);
        const tf = result.toolFixture || result;
        const format = program.opts().format;

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printSuccess(
            `Created tool fixture: ${tf.name} (${tf.id || tf._id})`,
          );
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- update ---
  toolFixtures
    .command('update <id>')
    .description('Update a tool fixture')
    .option('--name <name>', 'New name')
    .option('--description <description>', 'New description')
    .option('--file <path>', 'Replace full definition from a JSON or YAML file')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--active', 'Set as active')
    .option('--inactive', 'Set as inactive')
    .action(async (id: string, options) => {
      try {
        let dto: Record<string, any> = {};

        // If --file is provided, load the file contents as the base
        if (options.file) {
          const filePath = path.resolve(options.file);
          if (!fs.existsSync(filePath)) {
            printError(`File not found: ${filePath}`);
            process.exit(1);
          }

          const content = fs.readFileSync(filePath, 'utf-8');

          if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
            dto = yaml.load(content) as Record<string, any>;
          } else {
            dto = JSON.parse(content);
          }
        }

        // CLI options override file data
        if (options.name) dto.name = options.name;
        if (options.description) dto.description = options.description;
        if (options.tags) {
          dto.tags = options.tags.split(',').map((t: string) => t.trim());
        }
        if (options.active) dto.isActive = true;
        if (options.inactive) dto.isActive = false;

        if (Object.keys(dto).length === 0) {
          printError(
            'No update options provided. Use --name, --description, --file, --active, --inactive, or --tags.',
          );
          process.exit(1);
        }

        const result = await patch(`/tool-fixtures/${id}`, dto);
        const tf = result.toolFixture || result;
        const format = program.opts().format;

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printSuccess(
            `Updated tool fixture: ${tf.name} (${tf.id || tf._id})`,
          );
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- delete ---
  toolFixtures
    .command('delete <id>')
    .description('Delete a tool fixture')
    .option('--force', 'Skip confirmation prompt')
    .action(async (id: string, options) => {
      try {
        if (!options.force) {
          const { confirmed } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmed',
              message: `Delete tool fixture ${id}? This cannot be undone.`,
              default: false,
            },
          ]);

          if (!confirmed) {
            console.log('Cancelled.');
            return;
          }
        }

        await del(`/tool-fixtures/${id}`);
        const format = program.opts().format;

        if (format === 'json') {
          console.log(JSON.stringify({ deleted: true, id }, null, 2));
        } else {
          printSuccess(`Deleted tool fixture: ${id}`);
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });
}

/**
 * Format a JSON object with indentation for display.
 */
function formatJsonIndented(obj: any, indent: number): string {
  const pad = ' '.repeat(indent);
  return JSON.stringify(obj, null, 2)
    .split('\n')
    .map((line) => pad + line)
    .join('\n');
}
