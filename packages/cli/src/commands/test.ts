import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import chalk from 'chalk';
import ora from 'ora';
import { get, post, formatError } from '../client';
import { printError, printWarning, printSuccess } from '../output';
import { loadConfig } from '../config';
import { loadAgentYaml, type AgentDefinition } from '../agent-loader';
import {
  evaluateAssertions,
  type TestDefinition,
  type Assertion,
  type AssertionResult,
} from '../assertions';
import {
  saveBaseline,
  loadBaseline,
  compareWithBaseline,
  printBaselineComparison,
} from '../baseline';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface TestFileResult {
  file: string;
  scenarioName: string;
  assertions: AssertionResult[];
  error?: string;
}

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  assertions: {
    total: number;
    passed: number;
    failed: number;
  };
}

/* ------------------------------------------------------------------ */
/* YAML parsing                                                        */
/* ------------------------------------------------------------------ */

function parseTestYaml(filePath: string): TestDefinition {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = yaml.load(content) as any;

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Test YAML is empty or not an object: ${filePath}`);
  }

  if (!parsed.scenario || typeof parsed.scenario !== 'string') {
    throw new Error(
      `Test YAML missing required field "scenario" in ${filePath}`,
    );
  }

  if (!parsed.assertions || !Array.isArray(parsed.assertions)) {
    throw new Error(
      `Test YAML missing required field "assertions" (must be an array) in ${filePath}`,
    );
  }

  if (parsed.assertions.length === 0) {
    throw new Error(`Test YAML has no assertions in ${filePath}`);
  }

  // Validate each assertion has a type
  for (let i = 0; i < parsed.assertions.length; i++) {
    const a = parsed.assertions[i];
    if (!a.type || typeof a.type !== 'string') {
      throw new Error(
        `Assertion #${i + 1} missing "type" field in ${filePath}`,
      );
    }
  }

  return {
    scenario: parsed.scenario,
    agent: parsed.agent,
    assertions: parsed.assertions as Assertion[],
  };
}

/* ------------------------------------------------------------------ */
/* Scenario resolution                                                 */
/* ------------------------------------------------------------------ */

/** Check if a string looks like a MongoDB ObjectId. */
function isObjectId(str: string): boolean {
  return /^[a-f0-9]{24}$/.test(str);
}

/** Convert a name to a URL-friendly slug for matching. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Resolve a scenario identifier (slug or ID) to a scenario object.
 */
async function resolveScenario(
  scenarioRef: string,
): Promise<{ id: string; name: string }> {
  // If it's an ObjectId, fetch directly
  if (isObjectId(scenarioRef)) {
    const result = await get(`/scenarios/${scenarioRef}`);
    const scenario = result.scenario || result;
    return {
      id: scenario.id || scenario._id,
      name: scenario.name || scenarioRef,
    };
  }

  // Otherwise, search by name/slug
  const result = await get('/scenarios', { limit: '200' });
  const items = result.scenarios || [];
  const match = items.find(
    (s: any) =>
      slugify(s.name) === slugify(scenarioRef) ||
      s.name.toLowerCase() === scenarioRef.toLowerCase(),
  );

  if (!match) {
    throw new Error(
      `Scenario "${scenarioRef}" not found. Run "chanl scenarios list" to see available scenarios.`,
    );
  }

  return { id: match.id || match._id, name: match.name };
}

/* ------------------------------------------------------------------ */
/* Execution with adapter config                                       */
/* ------------------------------------------------------------------ */

/**
 * Build the executeDto with adapter config, same logic as scenarios.ts executeAndPoll.
 */
function buildExecuteDto(agentDef?: AgentDefinition): Record<string, any> {
  const config = loadConfig();
  const executeDto: Record<string, any> = {};

  if (agentDef) {
    if (agentDef.provider === 'openai') {
      if (!config.openaiApiKey) {
        throw new Error(
          `Agent "${agentDef.name}" uses OpenAI but no API key is configured. Set it with: chanl config set openaiApiKey sk-...`,
        );
      }
      executeDto.adapterType = 'openai';
      executeDto.adapterConfig = {
        apiKey: config.openaiApiKey,
        model: agentDef.model,
        systemPrompt: agentDef.systemPrompt,
        ...(agentDef.temperature !== undefined
          ? { temperature: agentDef.temperature }
          : {}),
        ...(agentDef.maxTokens !== undefined
          ? { maxTokens: agentDef.maxTokens }
          : {}),
      };
    } else if (agentDef.provider === 'anthropic') {
      if (!config.anthropicApiKey) {
        throw new Error(
          `Agent "${agentDef.name}" uses Anthropic but no API key is configured. Set it with: chanl config set anthropicApiKey sk-ant-...`,
        );
      }
      executeDto.adapterType = 'anthropic';
      executeDto.adapterConfig = {
        apiKey: config.anthropicApiKey,
        model: agentDef.model,
        systemPrompt: agentDef.systemPrompt,
        ...(agentDef.temperature !== undefined
          ? { temperature: agentDef.temperature }
          : {}),
        ...(agentDef.maxTokens !== undefined
          ? { maxTokens: agentDef.maxTokens }
          : {}),
      };
    } else if (agentDef.provider === 'http') {
      const endpoint = agentDef.httpEndpoint || config.httpEndpoint;
      if (!endpoint) {
        throw new Error(
          `Agent "${agentDef.name}" uses HTTP provider but no endpoint is configured.`,
        );
      }
      executeDto.adapterType = 'http';
      executeDto.adapterConfig = {
        endpoint,
        systemPrompt: agentDef.systemPrompt,
        ...(config.httpApiKey ? { apiKey: config.httpApiKey } : {}),
        ...(agentDef.temperature !== undefined
          ? { temperature: agentDef.temperature }
          : {}),
        ...(agentDef.maxTokens !== undefined
          ? { maxTokens: agentDef.maxTokens }
          : {}),
      };
    }
  } else {
    // Resolve from CLI config
    if (config.provider === 'openai' && config.openaiApiKey) {
      executeDto.adapterType = 'openai';
      executeDto.adapterConfig = { apiKey: config.openaiApiKey };
    } else if (config.provider === 'anthropic' && config.anthropicApiKey) {
      executeDto.adapterType = 'anthropic';
      executeDto.adapterConfig = { apiKey: config.anthropicApiKey };
    } else if (config.provider === 'http' && config.httpEndpoint) {
      executeDto.adapterType = 'http';
      executeDto.adapterConfig = {
        endpoint: config.httpEndpoint,
        ...(config.httpApiKey ? { apiKey: config.httpApiKey } : {}),
      };
    } else if (config.openaiApiKey) {
      executeDto.adapterType = 'openai';
      executeDto.adapterConfig = { apiKey: config.openaiApiKey };
    } else if (config.anthropicApiKey) {
      executeDto.adapterType = 'anthropic';
      executeDto.adapterConfig = { apiKey: config.anthropicApiKey };
    }
  }

  if (!executeDto.adapterType) {
    throw new Error(
      'No provider configured. Set a provider and API key:\n' +
        '  chanl config set provider openai\n' +
        '  chanl config set openaiApiKey sk-...',
    );
  }

  return executeDto;
}

/* ------------------------------------------------------------------ */
/* Polling                                                             */
/* ------------------------------------------------------------------ */

const TERMINAL_STATES = ['completed', 'failed', 'timeout', 'cancelled'];
const POLL_INTERVAL = 2000;
const MAX_POLLS = 150;

async function pollUntilDone(executionId: string): Promise<any> {
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL);
    const result = await get(`/scenarios/executions/${executionId}`);
    const execution = result.execution || result;
    if (TERMINAL_STATES.includes(execution.status)) {
      return execution;
    }
  }
  throw new Error(`Polling timeout for execution ${executionId}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/* Single test file runner                                             */
/* ------------------------------------------------------------------ */

async function runTestFile(
  filePath: string,
  testDef: TestDefinition,
): Promise<TestFileResult> {
  const config = loadConfig();
  const basename = path.basename(filePath);

  // Resolve agent YAML if specified
  let agentDef: AgentDefinition | undefined;
  if (testDef.agent) {
    const agentPath = path.resolve(path.dirname(filePath), testDef.agent);
    agentDef = loadAgentYaml(agentPath, config.provider || undefined);
  }

  // Resolve scenario
  const scenario = await resolveScenario(testDef.scenario);

  // Build execution payload
  const executeDto = buildExecuteDto(agentDef);

  // Execute
  const execResult = await post(
    `/scenarios/${scenario.id}/execute`,
    executeDto,
  );
  const execution = execResult.execution || execResult;
  const executionId = execution.executionId || execution.id || execution._id;

  // Poll until done
  const finalExecution = await pollUntilDone(executionId);

  // Evaluate assertions
  const results = evaluateAssertions(testDef.assertions, finalExecution);

  return {
    file: basename,
    scenarioName: scenario.name,
    assertions: results,
  };
}

/* ------------------------------------------------------------------ */
/* Output formatting                                                   */
/* ------------------------------------------------------------------ */

function printHumanResults(
  results: TestFileResult[],
  summary: TestSummary,
): void {
  console.log('');
  console.log(
    chalk.bold(`chanl test`) +
      chalk.dim(` \u2014 ${summary.total} test${summary.total === 1 ? '' : 's'}`),
  );
  console.log('');

  for (const result of results) {
    if (result.error) {
      console.log(`  ${chalk.red('\u2717')} ${result.file}`);
      console.log(`    ${chalk.red(result.error)}`);
      console.log('');
      continue;
    }

    console.log(`  ${result.file}`);
    for (const a of result.assertions) {
      const icon = a.passed ? chalk.green('\u2713') : chalk.red('\u2717');
      const typeTag = chalk.dim(`(${a.type})`);
      const desc = a.description || a.type;

      if (a.passed) {
        console.log(`    ${icon} ${desc} ${typeTag}`);
      } else {
        console.log(
          `    ${icon} ${desc} ${typeTag} ${chalk.dim('\u2014')} ${chalk.red(a.reason)}`,
        );
      }
    }
    console.log('');
  }

  // Summary line
  const parts: string[] = [];
  if (summary.assertions.passed > 0) {
    parts.push(chalk.green(`${summary.assertions.passed} passed`));
  }
  if (summary.assertions.failed > 0) {
    parts.push(chalk.red(`${summary.assertions.failed} failed`));
  }
  if (summary.errored > 0) {
    parts.push(chalk.red(`${summary.errored} errored`));
  }

  console.log(
    `Results: ${parts.join(', ')} (${summary.total} test${summary.total === 1 ? '' : 's'})`,
  );
}

function printJsonResults(
  results: TestFileResult[],
  summary: TestSummary,
): void {
  const output = {
    tests: results.map((r) => ({
      file: r.file,
      scenario: r.scenarioName,
      error: r.error || undefined,
      assertions: r.assertions.map((a) => ({
        type: a.type,
        description: a.description,
        passed: a.passed,
        actual: a.actual,
        expected: a.expected,
        reason: a.reason,
      })),
    })),
    summary: {
      total: summary.total,
      passed: summary.passed,
      failed: summary.failed,
      errored: summary.errored,
      assertions: summary.assertions,
    },
  };
  console.log(JSON.stringify(output, null, 2));
}

function computeSummary(results: TestFileResult[]): TestSummary {
  let totalAssertions = 0;
  let passedAssertions = 0;
  let failedAssertions = 0;
  let passedTests = 0;
  let failedTests = 0;
  let erroredTests = 0;

  for (const r of results) {
    if (r.error) {
      erroredTests++;
      continue;
    }
    const allPassed = r.assertions.every((a) => a.passed);
    if (allPassed) {
      passedTests++;
    } else {
      failedTests++;
    }
    for (const a of r.assertions) {
      totalAssertions++;
      if (a.passed) passedAssertions++;
      else failedAssertions++;
    }
  }

  return {
    total: results.length,
    passed: passedTests,
    failed: failedTests,
    errored: erroredTests,
    assertions: {
      total: totalAssertions,
      passed: passedAssertions,
      failed: failedAssertions,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Command registration                                                */
/* ------------------------------------------------------------------ */

export function registerTestCommand(program: Command): void {
  program
    .command('test <path>')
    .description(
      'Run scenario tests with pass/fail assertions (like jest for AI agents)',
    )
    .option('--json', 'Output results as JSON (for CI)')
    .option(
      '--save-baseline',
      'Save test results as baseline snapshot (.chanl-baseline.json)',
    )
    .option(
      '--baseline',
      'Compare results against saved baseline and detect regressions',
    )
    .action(
      async (
        testPath: string,
        options: {
          json?: boolean;
          saveBaseline?: boolean;
          baseline?: boolean;
        },
      ) => {
        const format = options.json ? 'json' : program.opts().format;
        const isJson = format === 'json';

        try {
          const resolvedPath = path.resolve(testPath);

          if (!fs.existsSync(resolvedPath)) {
            printError(`Path not found: ${resolvedPath}`);
            process.exit(1);
          }

          // Collect test files
          const stat = fs.statSync(resolvedPath);
          let files: string[];

          if (stat.isDirectory()) {
            files = fs
              .readdirSync(resolvedPath)
              .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
              .sort()
              .map((f) => path.join(resolvedPath, f));
          } else {
            files = [resolvedPath];
          }

          if (files.length === 0) {
            printError('No .yaml test files found in directory');
            process.exit(1);
          }

          // Parse all test files upfront to fail fast on bad YAML
          const testDefs: Array<{ file: string; def: TestDefinition }> = [];
          for (const file of files) {
            try {
              const def = parseTestYaml(file);
              testDefs.push({ file, def });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              printError(
                `Invalid test file ${path.basename(file)}: ${msg}`,
              );
              process.exit(1);
            }
          }

          // Run each test file
          const results: TestFileResult[] = [];
          const spinner = isJson
            ? null
            : ora(`Running ${testDefs.length} test file(s)...`).start();

          for (const { file, def } of testDefs) {
            const basename = path.basename(file);
            if (spinner) {
              spinner.text = `Running ${basename}...`;
            }

            try {
              const result = await runTestFile(file, def);
              results.push(result);
            } catch (err) {
              results.push({
                file: basename,
                scenarioName: def.scenario,
                assertions: [],
                error: formatError(err),
              });
            }
          }

          if (spinner) {
            spinner.stop();
          }

          // Compute summary and print
          const summary = computeSummary(results);

          if (isJson) {
            printJsonResults(results, summary);
          } else {
            printHumanResults(results, summary);
          }

          // --save-baseline: persist results as baseline snapshot
          if (options.saveBaseline) {
            const savedPath = saveBaseline(results);
            if (!isJson) {
              printSuccess(`Baseline saved to ${savedPath}`);
            }
          }

          // --baseline: compare against saved baseline
          let hasRegressions = false;
          if (options.baseline) {
            const baselineData = loadBaseline();
            if (!baselineData) {
              printWarning(
                'No baseline found. Run with --save-baseline first to create one.',
              );
            } else {
              const comparison = compareWithBaseline(results, baselineData);
              if (!isJson) {
                printBaselineComparison(comparison);
              } else {
                // Append comparison to JSON output
                console.log(JSON.stringify({ baseline: comparison }, null, 2));
              }
              hasRegressions = comparison.hasRegressions;
            }
          }

          // Exit code: 1 if any test fails, or any assertion regressed
          if (summary.failed > 0 || summary.errored > 0 || hasRegressions) {
            process.exit(1);
          }
        } catch (err) {
          printError(formatError(err));
          process.exit(1);
        }
      },
    );
}
