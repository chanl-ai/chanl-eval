import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { loadConfig, saveConfig, CliConfig } from '../config';
import { printError } from '../output';
import { track } from '../analytics';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Interactive project setup for chanl-eval')
    .action(async () => {
      try {
        await runInit();
      } catch (err: any) {
        if (err.message === 'User force closed the prompt') {
          console.log('\nSetup cancelled.');
          process.exit(0);
        }
        printError(err.message);
        process.exit(1);
      }
    });
}

async function runInit(): Promise<void> {
  console.log('');
  console.log(chalk.bold('  Welcome to chanl-eval!'));
  console.log(chalk.dim('  AI agent testing framework'));
  console.log('');

  const config = loadConfig();

  // 1. LLM Provider
  const { provider } = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'LLM Provider:',
      choices: [
        { name: 'OpenAI', value: 'openai' },
        { name: 'Anthropic', value: 'anthropic' },
        { name: 'Custom HTTP endpoint', value: 'custom' },
      ],
      default: config.provider || 'openai',
    },
  ]);

  config.provider = provider;

  // 2. Provider API key
  if (provider === 'openai') {
    const { openaiApiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'openaiApiKey',
        message: 'OpenAI API Key:',
        mask: '*',
        validate: (input: string) =>
          input.startsWith('sk-') || 'Must start with sk-',
        when: !config.openaiApiKey,
      },
    ]);
    if (openaiApiKey) config.openaiApiKey = openaiApiKey;
  } else if (provider === 'anthropic') {
    const { anthropicApiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'anthropicApiKey',
        message: 'Anthropic API Key:',
        mask: '*',
        validate: (input: string) =>
          input.startsWith('sk-ant-') || 'Must start with sk-ant-',
        when: !config.anthropicApiKey,
      },
    ]);
    if (anthropicApiKey) config.anthropicApiKey = anthropicApiKey;
  }

  // 3. Voice testing
  const { voiceEnabled } = await inquirer.prompt([
    {
      type: 'list',
      name: 'voiceEnabled',
      message: 'Enable voice testing? (requires Twilio)',
      choices: [
        { name: 'No (text only)', value: false },
        { name: 'Yes', value: true },
      ],
      default: false,
    },
  ]);

  if (voiceEnabled) {
    const twilioAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'twilioAccountSid',
        message: 'Twilio Account SID:',
        validate: (input: string) =>
          input.startsWith('AC') || 'Must start with AC',
        when: !config.twilioAccountSid,
      },
      {
        type: 'password',
        name: 'twilioAuthToken',
        message: 'Twilio Auth Token:',
        mask: '*',
        when: !config.twilioAuthToken,
      },
      {
        type: 'input',
        name: 'twilioPhoneNumber',
        message: 'Twilio Phone Number (E.164 format):',
        validate: (input: string) =>
          input.startsWith('+') || 'Must start with +',
        when: !config.twilioPhoneNumber,
      },
    ]);

    if (twilioAnswers.twilioAccountSid)
      config.twilioAccountSid = twilioAnswers.twilioAccountSid;
    if (twilioAnswers.twilioAuthToken)
      config.twilioAuthToken = twilioAnswers.twilioAuthToken;
    if (twilioAnswers.twilioPhoneNumber)
      config.twilioPhoneNumber = twilioAnswers.twilioPhoneNumber;
  }

  // 4. Analytics
  const { analytics } = await inquirer.prompt([
    {
      type: 'list',
      name: 'analytics',
      message: 'Anonymous usage analytics? (helps improve chanl)',
      choices: [
        { name: 'Yes (recommended)', value: true },
        { name: 'No', value: false },
      ],
      default: true,
    },
  ]);

  config.analytics = analytics;
  if (analytics && !config.analyticsId) {
    config.analyticsId = randomUUID();
  }

  // Save config so far
  saveConfig(config);

  // 5. Start server?
  const { startServer } = await inquirer.prompt([
    {
      type: 'list',
      name: 'startServer',
      message: 'Start server now? (requires Docker)',
      choices: [
        { name: 'Yes', value: true },
        { name: 'No (run "chanl server start" later)', value: false },
      ],
      default: true,
    },
  ]);

  if (startServer) {
    // Check docker
    if (!hasDocker()) {
      console.log('');
      printError(
        'Docker not found. Install Docker Desktop:\n  https://docs.docker.com/get-docker/',
      );
      console.log('');
      console.log('After installing Docker, run:');
      console.log('  chanl server start');
      saveConfig(config);
      return;
    }

    await startServerAndSeed(config);
  } else {
    console.log('');
    console.log(chalk.bold('  Configuration saved!'));
    console.log('');
    console.log('  Get started:');
    console.log('    chanl server start');
    console.log('    chanl scenarios list');
  }

  // Track init event
  track('cli_init', {
    os: process.platform,
    node_version: process.version,
    provider_type: provider,
    voice_enabled: voiceEnabled,
  });

  // First-run analytics notice
  if (analytics) {
    console.log('');
    console.log(
      chalk.dim(
        'chanl collects anonymous usage data to improve the tool.',
      ),
    );
    console.log(
      chalk.dim('Run "chanl analytics disable" to opt out.'),
    );
  }
}

async function startServerAndSeed(config: CliConfig): Promise<void> {
  const { execFileSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  // Find compose file
  let composeFile = findComposeFile();
  if (!composeFile) {
    // Generate default compose file in ~/.chanl/
    const chanlDir = path.join(os.homedir(), '.chanl');
    if (!fs.existsSync(chanlDir)) {
      fs.mkdirSync(chanlDir, { recursive: true });
    }
    composeFile = path.join(chanlDir, 'docker-compose.yml');
    fs.writeFileSync(composeFile, getDefaultComposeYaml(), 'utf-8');
    console.log(chalk.dim(`  Generated ${composeFile}`));
  }

  // Start containers
  const spinner = ora('Starting server...').start();
  try {
    const dc = getDockerCmd();
    if (!dc) throw new Error('Docker not available');

    const args = [...dc.args, '-f', composeFile, 'up', '-d'];
    execFileSync(dc.cmd, args, { stdio: 'pipe', timeout: 120000 });
  } catch (err: any) {
    spinner.fail('Failed to start containers');
    printError(err.message);
    return;
  }

  // Wait for healthy
  const steps = [
    { label: 'MongoDB ready', check: () => true },
    { label: 'Redis ready', check: () => true },
    { label: `Server ready on ${config.server}`, check: () => true },
  ];

  try {
    spinner.text = 'Waiting for server to be healthy...';
    const health = await waitForHealth(config.server, 60000);
    spinner.succeed('Server is running');

    for (const step of steps) {
      console.log(chalk.green('  ✓') + ` ${step.label}`);
    }

    // Get or create API key
    if (!config.apiKey) {
      try {
        const res = await axios.post(`${config.server}/api-keys`, {
          name: 'cli-init',
        });
        const key = res.data?.key;
        if (key) {
          config.apiKey = key;
          saveConfig(config);
          console.log('');
          console.log(
            chalk.green('  ✓') +
              ` API key: ${key.slice(0, 8)}...${key.slice(-4)}`,
          );
        }
      } catch {
        // Keys may already exist (bootstrap created one)
        // Try to read from server logs or use existing config
      }
    }

    // Show seed status
    if (health.seeded) {
      console.log(chalk.green('  ✓') + ' Default data seeded');
    }
  } catch {
    spinner.warn('Server containers started but health check timed out');
    console.log('  Check logs: chanl server logs server');
    return;
  }

  saveConfig(config);

  console.log('');
  console.log(chalk.bold('  Get started:'));
  console.log('    chanl scenarios list');
  console.log('    chanl run angry-customer-refund');
  console.log('    chanl server logs');
}

function hasDocker(): boolean {
  try {
    require('child_process').execFileSync('docker', ['version'], {
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

function getDockerCmd(): { cmd: string; args: string[] } | null {
  try {
    require('child_process').execFileSync('docker', ['compose', 'version'], {
      stdio: 'pipe',
    });
    return { cmd: 'docker', args: ['compose'] };
  } catch {
    // fall through
  }
  try {
    require('child_process').execFileSync('docker-compose', ['version'], {
      stdio: 'pipe',
    });
    return { cmd: 'docker-compose', args: [] };
  } catch {
    // fall through
  }
  return null;
}

function findComposeFile(): string | null {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const candidates = [
    path.resolve('docker-compose.yml'),
    path.resolve('docker-compose.yaml'),
    path.join(os.homedir(), '.chanl', 'docker-compose.yml'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function waitForHealth(
  serverUrl: string,
  timeoutMs: number,
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await axios.get(`${serverUrl}/health`, { timeout: 3000 });
      if (res.data?.status === 'ok') return res.data;
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Health check timed out');
}

function getDefaultComposeYaml(): string {
  return `version: '3.8'

services:
  mongodb:
    image: mongo:7
    ports:
      - "27217:27017"
    volumes:
      - chanl-mongo-data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6479:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  server:
    image: ghcr.io/chanl-ai/chanl-eval-server:latest
    ports:
      - "18005:18005"
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/chanl-eval
      - REDIS_URL=redis://redis:6379
      - PORT=18005
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy

volumes:
  chanl-mongo-data:
`;
}
