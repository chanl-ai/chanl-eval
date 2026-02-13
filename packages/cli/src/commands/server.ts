import { Command } from 'commander';
import { execFile, spawn, ExecFileException } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import { loadConfig } from '../config';
import { printError, printSuccess } from '../output';

/** Detect docker compose command variant. */
function getDockerComposeCmd(): { cmd: string; args: string[] } | null {
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

/** Find docker-compose.yml location. */
function findComposeFile(): string | null {
  const candidates = [
    path.resolve('docker-compose.yml'),
    path.resolve('docker-compose.yaml'),
    path.join(os.homedir(), '.chanl', 'docker-compose.yml'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Generate a default docker-compose.yml in ~/.chanl/ and return its path. */
function generateDefaultComposeFile(): string {
  const chanlDir = path.join(os.homedir(), '.chanl');
  if (!fs.existsSync(chanlDir)) {
    fs.mkdirSync(chanlDir, { recursive: true });
  }
  const filePath = path.join(chanlDir, 'docker-compose.yml');
  fs.writeFileSync(
    filePath,
    `version: '3.8'

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
`,
    'utf-8',
  );
  return filePath;
}

/** Run a docker compose command and return stdout. */
function runDockerCompose(
  composeFile: string,
  subArgs: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const dc = getDockerComposeCmd();
    if (!dc) {
      reject(new Error('Docker not found'));
      return;
    }

    const fullArgs = [...dc.args, '-f', composeFile, ...subArgs];
    execFile(
      dc.cmd,
      fullArgs,
      { timeout: 60000 },
      (error: ExecFileException | null, stdout: string, stderr: string) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

/** Poll server health endpoint until ready. */
async function waitForServer(
  serverUrl: string,
  timeoutMs = 60000,
): Promise<any> {
  const start = Date.now();
  const interval = 2000;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await axios.get(`${serverUrl}/health`, { timeout: 3000 });
      if (res.data?.status === 'ok') {
        return res.data;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('Server did not become healthy within timeout');
}

/**
 * Check if the server is running. Used by other commands before making API calls.
 * Throws with a helpful message if not reachable.
 */
export async function ensureServerRunning(): Promise<void> {
  const config = loadConfig();
  try {
    await axios.get(`${config.server}/health`, { timeout: 3000 });
  } catch {
    throw new Error(
      `Server not running at ${config.server}\n\n` +
        `  Start it with:  chanl server start\n` +
        `  Or run init:    chanl init`,
    );
  }
}

export function registerServerCommand(program: Command): void {
  const server = program
    .command('server')
    .description('Manage the chanl-eval server (Docker)');

  // --- start ---
  server
    .command('start')
    .description('Start the server (docker compose up)')
    .action(async () => {
      try {
        const dc = getDockerComposeCmd();
        if (!dc) {
          printError(
            'Docker not found. Install Docker Desktop: https://docs.docker.com/get-docker/',
          );
          process.exit(1);
        }

        let composeFile = findComposeFile();
        if (!composeFile) {
          composeFile = generateDefaultComposeFile();
          console.log(chalk.dim(`  Generated ${composeFile}`));
        }

        const spinner = ora('Starting server...').start();

        try {
          await runDockerCompose(composeFile, ['up', '-d']);
          spinner.text = 'Containers started, waiting for server to be healthy...';
        } catch (err: any) {
          spinner.fail('Failed to start containers');
          printError(err.message);
          process.exit(1);
        }

        const config = loadConfig();
        try {
          const health = await waitForServer(config.server);
          spinner.succeed('Server is running');
          console.log('');
          console.log(`  URL:     ${config.server}`);
          console.log(`  Version: ${health.version}`);
          console.log(`  Seeded:  ${health.seeded ? 'yes' : 'no'}`);
          console.log('');
          console.log(
            chalk.dim('  View logs:  chanl server logs'),
          );
        } catch {
          spinner.warn('Containers started but server not yet healthy');
          console.log(
            `  Check logs: chanl server logs server`,
          );
        }
      } catch (err: any) {
        printError(err.message);
        process.exit(1);
      }
    });

  // --- stop ---
  server
    .command('stop')
    .description('Stop the server (docker compose down)')
    .action(async () => {
      try {
        const composeFile = findComposeFile();
        if (!composeFile) {
          printError('docker-compose.yml not found');
          process.exit(1);
        }

        const spinner = ora('Stopping server...').start();
        await runDockerCompose(composeFile, ['down']);
        spinner.succeed('Server stopped');
      } catch (err: any) {
        printError(err.message);
        process.exit(1);
      }
    });

  // --- status ---
  server
    .command('status')
    .description('Show server status')
    .action(async () => {
      try {
        const composeFile = findComposeFile();
        const config = loadConfig();

        // Check health endpoint
        let serverHealthy = false;
        let healthData: any = null;
        try {
          const res = await axios.get(`${config.server}/health`, {
            timeout: 3000,
          });
          if (res.data?.status === 'ok') {
            serverHealthy = true;
            healthData = res.data;
          }
        } catch {
          // not reachable
        }

        if (serverHealthy) {
          printSuccess(`Server running at ${config.server}`);
          console.log(`  Version:  ${healthData.version}`);
          console.log(`  Seeded:   ${healthData.seeded ? 'yes' : 'no'}`);
        } else {
          console.log(chalk.red('Server:') + ' not running');
          console.log(`  Expected: ${config.server}`);
        }

        // Show container status if compose file found
        if (composeFile) {
          console.log('');
          console.log(chalk.bold('Containers:'));
          try {
            const ps = await runDockerCompose(composeFile, ['ps', '--format', 'table']);
            console.log(ps);
          } catch {
            console.log(chalk.dim('  (docker compose not available)'));
          }
        }
      } catch (err: any) {
        printError(err.message);
        process.exit(1);
      }
    });

  // --- logs ---
  server
    .command('logs [service]')
    .description('View server logs (streams live)')
    .option('-n, --lines <n>', 'Number of lines to show', '50')
    .action(async (service: string | undefined, options) => {
      try {
        const dc = getDockerComposeCmd();
        if (!dc) {
          printError('Docker not found');
          process.exit(1);
        }

        const composeFile = findComposeFile();
        if (!composeFile) {
          printError('docker-compose.yml not found');
          process.exit(1);
        }

        const logArgs = [
          ...dc.args,
          '-f',
          composeFile,
          'logs',
          '-f',
          '--tail',
          options.lines,
        ];

        if (service) {
          logArgs.push(service);
        }

        const child = spawn(dc.cmd, logArgs, {
          stdio: 'inherit',
        });

        child.on('error', (err) => {
          printError(`Failed to stream logs: ${err.message}`);
          process.exit(1);
        });

        // Let Ctrl+C kill gracefully
        process.on('SIGINT', () => {
          child.kill('SIGINT');
          process.exit(0);
        });
      } catch (err: any) {
        printError(err.message);
        process.exit(1);
      }
    });
}
