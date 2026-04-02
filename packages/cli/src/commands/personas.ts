import { Command } from 'commander';
import { get, post, patch, del, formatError } from '../client';
import { printOutput, printSuccess, printError, truncate } from '../output';

export function registerPersonasCommand(program: Command): void {
  const personas = program
    .command('personas')
    .description('Manage test personas');

  // --- list ---
  personas
    .command('list')
    .description('List all personas')
    .option('--emotion <emotion>', 'Filter by emotion')
    .option('--language <language>', 'Filter by language')
    .option('--page <page>', 'Page number', '1')
    .option('--limit <limit>', 'Results per page', '20')
    .action(async (options) => {
      try {
        const params: Record<string, string> = {
          page: options.page,
          limit: options.limit,
        };
        if (options.emotion) params.emotion = options.emotion;
        if (options.language) params.language = options.language;

        const result = await get('/personas', params);
        const items = result.personas || [];
        const format = program.opts().format;

        const headers = ['ID', 'Name', 'Emotion', 'Language', 'Gender', 'Speech Style'];
        const rows = items.map((p: any) => [
          p.id || p._id || '',
          truncate(p.name || '', 25),
          p.emotion || '',
          p.language || '',
          p.gender || '',
          p.speechStyle || '',
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
  personas
    .command('create')
    .description('Create a new persona')
    .requiredOption('--name <name>', 'Persona name')
    .requiredOption(
      '--emotion <emotion>',
      'Emotion (friendly, frustrated, calm, neutral, etc.)',
    )
    .option(
      '--gender <gender>',
      'Gender (male, female)',
      'female',
    )
    .option(
      '--language <language>',
      'Language (english, spanish, portuguese)',
      'english',
    )
    .option(
      '--accent <accent>',
      'Accent (american, british, australian, etc.)',
      'american',
    )
    .option(
      '--speech-style <speechStyle>',
      'Speech style (slow, normal, fast)',
      'normal',
    )
    .option('--description <description>', 'Description')
    .option('--backstory <backstory>', 'Backstory for the persona')
    .option('--tags <tags>', 'Comma-separated tags')
    .action(async (options) => {
      try {
        const dto: Record<string, any> = {
          name: options.name,
          emotion: options.emotion,
          gender: options.gender,
          language: options.language,
          accent: options.accent,
          speechStyle: options.speechStyle,
          intentClarity: 'very clear',
          backgroundNoise: false,
          allowInterruptions: true,
        };

        if (options.description) dto.description = options.description;
        if (options.backstory) dto.backstory = options.backstory;
        if (options.tags) dto.tags = options.tags.split(',').map((t: string) => t.trim());

        const result = await post('/personas', dto);
        const persona = result.persona;
        const format = program.opts().format;

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printSuccess(
            `Created persona: ${persona.name} (${persona.id || persona._id})`,
          );
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- get ---
  personas
    .command('get <id>')
    .description('Get persona details')
    .action(async (id: string) => {
      try {
        const result = await get(`/personas/${id}`);
        const format = program.opts().format;

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const persona = result.persona;
          console.log(`Name:         ${persona.name}`);
          console.log(`ID:           ${persona.id || persona._id}`);
          console.log(`Emotion:      ${persona.emotion}`);
          console.log(`Gender:       ${persona.gender}`);
          console.log(`Language:     ${persona.language}`);
          console.log(`Accent:       ${persona.accent}`);
          console.log(`Speech Style: ${persona.speechStyle}`);
          if (persona.description) {
            console.log(`Description:  ${persona.description}`);
          }
          if (persona.tags && persona.tags.length > 0) {
            console.log(`Tags:         ${persona.tags.join(', ')}`);
          }
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- update ---
  personas
    .command('update <id>')
    .description('Update a persona')
    .option('--name <name>', 'New name')
    .option('--emotion <emotion>', 'New emotion')
    .option('--gender <gender>', 'New gender')
    .option('--language <language>', 'New language')
    .option('--accent <accent>', 'New accent')
    .option('--speech-style <speechStyle>', 'New speech style')
    .option('--description <description>', 'New description')
    .option('--backstory <backstory>', 'New backstory')
    .option('--tags <tags>', 'Comma-separated tags')
    .action(async (id: string, options) => {
      try {
        const dto: Record<string, any> = {};
        if (options.name) dto.name = options.name;
        if (options.emotion) dto.emotion = options.emotion;
        if (options.gender) dto.gender = options.gender;
        if (options.language) dto.language = options.language;
        if (options.accent) dto.accent = options.accent;
        if (options.speechStyle) dto.speechStyle = options.speechStyle;
        if (options.description) dto.description = options.description;
        if (options.backstory) dto.backstory = options.backstory;
        if (options.tags) {
          dto.tags = options.tags.split(',').map((t: string) => t.trim());
        }

        const result = await patch(`/personas/${id}`, dto);
        const persona = result.persona || result;
        const format = program.opts().format;

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printSuccess(
            `Updated persona: ${persona.name} (${persona.id || persona._id})`,
          );
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- delete ---
  personas
    .command('delete <id>')
    .description('Delete a persona')
    .option('--force', 'Skip confirmation prompt')
    .action(async (id: string, options) => {
      try {
        if (!options.force) {
          const inquirer = await import('inquirer');
          const answers = await inquirer.default.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Delete persona ${id}?`,
              default: false,
            },
          ]);
          if (!answers.confirm) {
            console.log('Cancelled.');
            return;
          }
        }

        await del(`/personas/${id}`);
        printSuccess(`Deleted persona: ${id}`);
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });

  // --- defaults ---
  personas
    .command('defaults')
    .description('Create default personas')
    .action(async () => {
      try {
        const result = await post('/personas/defaults');
        const format = program.opts().format;

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const personas = result.personas || [];
          printSuccess(`Created ${personas.length} default persona(s)`);
          for (const p of personas) {
            console.log(`  - ${p.name} (${p.emotion})`);
          }
        }
      } catch (err) {
        printError(formatError(err));
        process.exit(1);
      }
    });
}
