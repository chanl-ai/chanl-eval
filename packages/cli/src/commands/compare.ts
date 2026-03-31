import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { get, post, formatError } from '../client';
import { printError } from '../output';
import { loadConfig } from '../config';
import { loadAgentYaml, parseModelString, type AgentDefinition } from '../agent-loader';

// ── Types ──────────────────────────────────────────────────────────────────────

/** Metrics extracted from a single execution for comparison. */
export interface ComparisonMetrics {
  overallScore: number | null;
  avgLatency: number | null;
  turns: number | null;
  duration: number | null;
}

/** One side of the comparison (A or B). */
export interface ComparisonSide {
  label: string;
  model: string;
  execution: any | null;
  metrics: ComparisonMetrics;
  error: string | null;
}

/** Full comparison result. */
export interface ComparisonResult {
  scenario: string;
  sideA: ComparisonSide;
  sideB: ComparisonSide;
  winner: 'A' | 'B' | 'tie' | null;
  winnerReason: string;
}

// ── Metric extraction ──────────────────────────────────────────────────────────

/**
 * Extract comparison-relevant metrics from an execution object.
 */
export function extractMetrics(execution: any): ComparisonMetrics {
  const metrics: ComparisonMetrics = {
    overallScore: null,
    avgLatency: null,
    turns: null,
    duration: null,
  };

  if (!execution) return metrics;

  // Overall score
  if (execution.overallScore !== undefined && execution.overallScore !== null) {
    metrics.overallScore = Math.round(execution.overallScore);
  }

  // Duration
  if (execution.duration) {
    metrics.duration = execution.duration;
  }

  // Latency and turns from stepResults
  if (execution.stepResults && execution.stepResults.length > 0) {
    const agentSteps = execution.stepResults.filter(
      (s: any) =>
        typeof s.stepId === 'string' &&
        s.stepId.includes('agent') &&
        s.duration > 0,
    );

    if (agentSteps.length > 0) {
      const totalLatency = agentSteps.reduce(
        (sum: number, s: any) => sum + s.duration,
        0,
      );
      metrics.avgLatency = Math.round(totalLatency / agentSteps.length);
      metrics.turns = agentSteps.length;
    }
  }

  return metrics;
}

/**
 * Determine the winner based on metrics.
 * Score is weighted highest, then latency, then turns, then duration.
 */
export function determineWinner(
  a: ComparisonMetrics,
  b: ComparisonMetrics,
): { winner: 'A' | 'B' | 'tie' | null; reason: string } {
  // If both failed, no winner
  if (a.overallScore === null && b.overallScore === null) {
    return { winner: null, reason: 'Both executions produced no score' };
  }

  // If only one has a score, that one wins
  if (a.overallScore !== null && b.overallScore === null) {
    return { winner: 'A', reason: 'Only Model A produced a score' };
  }
  if (a.overallScore === null && b.overallScore !== null) {
    return { winner: 'B', reason: 'Only Model B produced a score' };
  }

  // Both have scores — compare
  const scoreDiff = (a.overallScore ?? 0) - (b.overallScore ?? 0);

  if (scoreDiff > 0) {
    return {
      winner: 'A',
      reason: `higher score (${a.overallScore} vs ${b.overallScore})`,
    };
  }
  if (scoreDiff < 0) {
    return {
      winner: 'B',
      reason: `higher score (${b.overallScore} vs ${a.overallScore})`,
    };
  }

  // Scores tied — compare latency (lower is better)
  if (a.avgLatency !== null && b.avgLatency !== null) {
    if (a.avgLatency < b.avgLatency) {
      return {
        winner: 'A',
        reason: `same score, faster responses (${a.avgLatency}ms vs ${b.avgLatency}ms)`,
      };
    }
    if (a.avgLatency > b.avgLatency) {
      return {
        winner: 'B',
        reason: `same score, faster responses (${b.avgLatency}ms vs ${a.avgLatency}ms)`,
      };
    }
  }

  // Scores and latency tied — compare turns (fewer is better)
  if (a.turns !== null && b.turns !== null) {
    if (a.turns < b.turns) {
      return {
        winner: 'A',
        reason: `same score, fewer turns (${a.turns} vs ${b.turns})`,
      };
    }
    if (a.turns > b.turns) {
      return {
        winner: 'B',
        reason: `same score, fewer turns (${b.turns} vs ${a.turns})`,
      };
    }
  }

  return { winner: 'tie', reason: 'identical metrics' };
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

/** Format a metric cell with star marker for the winner. */
function fmtCell(
  value: string | null,
  isWinner: boolean,
): string {
  if (value === null) return chalk.dim('n/a');
  return isWinner ? `${value} ${chalk.yellow('\u2605')}` : value;
}

/**
 * Build the human-readable comparison table output.
 */
export function formatComparisonTable(result: ComparisonResult): string {
  const { sideA, sideB } = result;
  const lines: string[] = [];

  lines.push('');
  lines.push(
    chalk.bold(`chanl compare`) +
      chalk.dim(` \u2014 ${result.scenario}`),
  );
  lines.push('');
  lines.push(`  Model A: ${chalk.cyan(sideA.label)} (${sideA.model})`);
  lines.push(`  Model B: ${chalk.cyan(sideB.label)} (${sideB.model})`);
  lines.push('');

  // If either side errored, show the error
  if (sideA.error) {
    lines.push(`  ${chalk.red('Model A failed:')} ${sideA.error}`);
  }
  if (sideB.error) {
    lines.push(`  ${chalk.red('Model B failed:')} ${sideB.error}`);
  }
  if (sideA.error || sideB.error) {
    lines.push('');
  }

  // Metrics table
  const ma = sideA.metrics;
  const mb = sideB.metrics;

  type MetricRow = {
    label: string;
    a: string | null;
    b: string | null;
    lowerIsBetter: boolean;
  };

  const rows: MetricRow[] = [
    {
      label: 'Overall Score',
      a: ma.overallScore !== null ? `${ma.overallScore}/100` : null,
      b: mb.overallScore !== null ? `${mb.overallScore}/100` : null,
      lowerIsBetter: false,
    },
    {
      label: 'Avg Latency',
      a:
        ma.avgLatency !== null
          ? `${(ma.avgLatency / 1000).toFixed(1)}s`
          : null,
      b:
        mb.avgLatency !== null
          ? `${(mb.avgLatency / 1000).toFixed(1)}s`
          : null,
      lowerIsBetter: true,
    },
    {
      label: 'Turns',
      a: ma.turns !== null ? String(ma.turns) : null,
      b: mb.turns !== null ? String(mb.turns) : null,
      lowerIsBetter: true,
    },
    {
      label: 'Duration',
      a:
        ma.duration !== null
          ? `${(ma.duration / 1000).toFixed(0)}s`
          : null,
      b:
        mb.duration !== null
          ? `${(mb.duration / 1000).toFixed(0)}s`
          : null,
      lowerIsBetter: true,
    },
  ];

  // Only show rows where at least one side has data
  const visibleRows = rows.filter((r) => r.a !== null || r.b !== null);

  if (visibleRows.length > 0) {
    // Column widths
    const labelW = 17;
    const colW = 12;
    const sep = '\u2502';
    const hline = '\u2500';
    const topLeft = '\u250c';
    const topMid = '\u252c';
    const topRight = '\u2510';
    const midLeft = '\u251c';
    const midMid = '\u253c';
    const midRight = '\u2524';
    const botLeft = '\u2514';
    const botMid = '\u2534';
    const botRight = '\u2518';

    const pad = (s: string, w: number) => {
      // Strip ANSI for length calculation
      const stripped = s.replace(/\x1b\[[0-9;]*m/g, '');
      const padding = Math.max(0, w - stripped.length);
      return s + ' '.repeat(padding);
    };

    lines.push(
      `  ${topLeft}${hline.repeat(labelW + 2)}${topMid}${hline.repeat(colW + 2)}${topMid}${hline.repeat(colW + 2)}${topRight}`,
    );
    lines.push(
      `  ${sep} ${pad(chalk.bold('Metric'), labelW)} ${sep} ${pad(chalk.bold(' Model A'), colW)} ${sep} ${pad(chalk.bold(' Model B'), colW)} ${sep}`,
    );
    lines.push(
      `  ${midLeft}${hline.repeat(labelW + 2)}${midMid}${hline.repeat(colW + 2)}${midMid}${hline.repeat(colW + 2)}${midRight}`,
    );

    for (const row of visibleRows) {
      // Determine which side wins this row
      let aWins = false;
      let bWins = false;

      if (row.a !== null && row.b !== null) {
        const aNum = parseFloat(row.a);
        const bNum = parseFloat(row.b);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          if (row.lowerIsBetter) {
            aWins = aNum < bNum;
            bWins = bNum < aNum;
          } else {
            aWins = aNum > bNum;
            bWins = bNum > aNum;
          }
        }
      }

      const aCell = fmtCell(row.a, aWins);
      const bCell = fmtCell(row.b, bWins);

      lines.push(
        `  ${sep} ${pad(row.label, labelW)} ${sep}  ${pad(aCell, colW)}${sep}  ${pad(bCell, colW)}${sep}`,
      );
    }

    lines.push(
      `  ${botLeft}${hline.repeat(labelW + 2)}${botMid}${hline.repeat(colW + 2)}${botMid}${hline.repeat(colW + 2)}${botRight}`,
    );
  }

  lines.push('');

  // Winner line
  if (result.winner === 'A') {
    lines.push(
      `  ${chalk.green('Winner:')} Model A (${sideA.model}) \u2014 ${result.winnerReason}`,
    );
  } else if (result.winner === 'B') {
    lines.push(
      `  ${chalk.green('Winner:')} Model B (${sideB.model}) \u2014 ${result.winnerReason}`,
    );
  } else if (result.winner === 'tie') {
    lines.push(`  ${chalk.yellow('Tie:')} ${result.winnerReason}`);
  } else {
    lines.push(
      `  ${chalk.dim('No winner could be determined:')} ${result.winnerReason}`,
    );
  }

  lines.push('');
  lines.push(chalk.dim('  Run with --json for full transcripts'));

  return lines.join('\n');
}

// ── Execution helpers ──────────────────────────────────────────────────────────

const TERMINAL_STATES = ['completed', 'failed', 'timeout', 'cancelled'];
const POLL_INTERVAL = 2000;
const MAX_POLLS = 150;

/**
 * Build the adapter config portion of the execute DTO from an agent definition.
 */
function buildAdapterConfig(
  agentDef: AgentDefinition,
  config: ReturnType<typeof loadConfig>,
): { adapterType: string; adapterConfig: Record<string, any> } {
  if (agentDef.provider === 'openai') {
    if (!config.openaiApiKey) {
      throw new Error(
        `Agent "${agentDef.name}" uses OpenAI but no API key is configured. Set it with: chanl config set openaiApiKey sk-...`,
      );
    }
    return {
      adapterType: 'openai',
      adapterConfig: {
        apiKey: config.openaiApiKey,
        model: agentDef.model,
        systemPrompt: agentDef.systemPrompt,
        ...(agentDef.temperature !== undefined
          ? { temperature: agentDef.temperature }
          : {}),
        ...(agentDef.maxTokens !== undefined
          ? { maxTokens: agentDef.maxTokens }
          : {}),
      },
    };
  }

  if (agentDef.provider === 'anthropic') {
    if (!config.anthropicApiKey) {
      throw new Error(
        `Agent "${agentDef.name}" uses Anthropic but no API key is configured. Set it with: chanl config set anthropicApiKey sk-ant-...`,
      );
    }
    return {
      adapterType: 'anthropic',
      adapterConfig: {
        apiKey: config.anthropicApiKey,
        model: agentDef.model,
        systemPrompt: agentDef.systemPrompt,
        ...(agentDef.temperature !== undefined
          ? { temperature: agentDef.temperature }
          : {}),
        ...(agentDef.maxTokens !== undefined
          ? { maxTokens: agentDef.maxTokens }
          : {}),
      },
    };
  }

  if (agentDef.provider === 'http') {
    const endpoint = agentDef.httpEndpoint || config.httpEndpoint;
    if (!endpoint) {
      throw new Error(
        `Agent "${agentDef.name}" uses HTTP provider but no endpoint is configured.`,
      );
    }
    return {
      adapterType: 'http',
      adapterConfig: {
        endpoint,
        systemPrompt: agentDef.systemPrompt,
        ...(config.httpApiKey ? { apiKey: config.httpApiKey } : {}),
        ...(agentDef.temperature !== undefined
          ? { temperature: agentDef.temperature }
          : {}),
        ...(agentDef.maxTokens !== undefined
          ? { maxTokens: agentDef.maxTokens }
          : {}),
      },
    };
  }

  throw new Error(`Unsupported provider "${agentDef.provider}" in agent YAML.`);
}

/**
 * Build adapter config from a model string and CLI config.
 */
function buildAdapterConfigFromModel(
  modelStr: string,
  config: ReturnType<typeof loadConfig>,
): { adapterType: string; adapterConfig: Record<string, any> } {
  const parsed = parseModelString(modelStr, config.provider || undefined);

  if (parsed.provider === 'openai') {
    if (!config.openaiApiKey) {
      throw new Error(
        `Model "${modelStr}" uses OpenAI but no API key is configured. Set it with: chanl config set openaiApiKey sk-...`,
      );
    }
    return {
      adapterType: 'openai',
      adapterConfig: { apiKey: config.openaiApiKey, model: parsed.model },
    };
  }

  if (parsed.provider === 'anthropic') {
    if (!config.anthropicApiKey) {
      throw new Error(
        `Model "${modelStr}" uses Anthropic but no API key is configured. Set it with: chanl config set anthropicApiKey sk-ant-...`,
      );
    }
    return {
      adapterType: 'anthropic',
      adapterConfig: { apiKey: config.anthropicApiKey, model: parsed.model },
    };
  }

  if (parsed.provider === 'http') {
    const endpoint = parsed.httpEndpoint || config.httpEndpoint;
    if (!endpoint) {
      throw new Error(
        `Model "${modelStr}" uses HTTP provider but no endpoint is configured.`,
      );
    }
    return {
      adapterType: 'http',
      adapterConfig: {
        endpoint,
        ...(config.httpApiKey ? { apiKey: config.httpApiKey } : {}),
      },
    };
  }

  throw new Error(
    `Could not determine provider for model "${modelStr}". Use "openai:model" or "anthropic:model" prefix.`,
  );
}

/**
 * Execute a scenario and poll until completion. Returns the execution object.
 */
async function executeAndWait(
  scenarioId: string,
  adapterType: string,
  adapterConfig: Record<string, any>,
  label: string,
): Promise<any> {
  const executeDto: Record<string, any> = {
    adapterType,
    adapterConfig,
  };

  const spinner = ora(`Running ${label}...`).start();

  const execResult = await post(
    `/scenarios/${scenarioId}/execute`,
    executeDto,
  );
  const execution = execResult.execution;
  const executionId = execution.executionId || execution.id || execution._id;

  spinner.text = `${label}: execution started (${executionId})`;

  // Poll until terminal state
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL);

    try {
      const result = await get(`/scenarios/executions/${executionId}`);
      const exec = result.execution;

      if (exec.metrics) {
        const pct = Math.round(
          ((exec.metrics.completedSteps || 0) /
            (exec.metrics.totalSteps || 1)) *
            100,
        );
        spinner.text = `${label}: ${exec.status} (${pct}% done)`;
      } else {
        spinner.text = `${label}: ${exec.status}`;
      }

      if (TERMINAL_STATES.includes(exec.status)) {
        if (exec.status === 'completed') {
          spinner.succeed(`${label}: completed`);
        } else if (exec.status === 'failed') {
          spinner.fail(`${label}: failed`);
        } else {
          spinner.warn(`${label}: ${exec.status}`);
        }
        return exec;
      }
    } catch (err) {
      spinner.text = `${label}: polling... (${formatError(err)})`;
    }
  }

  spinner.warn(`${label}: polling timeout`);
  return execution;
}

/**
 * Resolve a scenario slug or name to its ID.
 */
async function resolveScenarioId(nameOrId: string): Promise<string> {
  if (/^[a-f0-9]{24}$/.test(nameOrId)) {
    return nameOrId;
  }

  const result = await get('/scenarios', { limit: '200' });
  const items = result.scenarios || [];
  const slugify = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const match = items.find(
    (s: any) =>
      slugify(s.name) === slugify(nameOrId) ||
      s.name.toLowerCase() === nameOrId.toLowerCase(),
  );

  if (!match) {
    throw new Error(
      `Scenario "${nameOrId}" not found. Run "chanl scenarios list" to see available scenarios.`,
    );
  }

  return match.id || match._id;
}

// ── Main command ───────────────────────────────────────────────────────────────

export function registerCompareCommand(program: Command): void {
  program
    .command('compare')
    .description(
      'Run the same scenario against two agents/models and compare results',
    )
    .requiredOption(
      '--scenario <scenario>',
      'Scenario name, slug, or ID to run',
    )
    .option('--agent-a <path>', 'Path to agent A YAML file')
    .option('--agent-b <path>', 'Path to agent B YAML file')
    .option('--model-a <model>', 'Model A string (e.g. gpt-4o, anthropic:claude-sonnet-4-20250514)')
    .option('--model-b <model>', 'Model B string (e.g. gpt-4o, anthropic:claude-sonnet-4-20250514)')
    .action(async (options) => {
      try {
        await runCompareAction(options, program.opts().format);
      } catch (err) {
        printError(formatError(err));
        process.exitCode = 1;
      }
    });
}

/**
 * Validate CLI options for compare command.
 * Returns a descriptive error string if invalid, or null if valid.
 */
export function validateCompareOptions(options: {
  agentA?: string;
  agentB?: string;
  modelA?: string;
  modelB?: string;
  scenario?: string;
}): string | null {
  if (!options.scenario) {
    return 'Missing --scenario. Specify a scenario name, slug, or ID.';
  }

  const hasAgents = options.agentA || options.agentB;
  const hasModels = options.modelA || options.modelB;

  if (hasAgents && hasModels) {
    return 'Cannot mix --agent-a/b and --model-a/b. Use one pair or the other.';
  }

  if (!hasAgents && !hasModels) {
    return 'Specify either --agent-a and --agent-b (YAML files) or --model-a and --model-b (model strings).';
  }

  if (hasAgents) {
    if (!options.agentA || !options.agentB) {
      return 'Both --agent-a and --agent-b are required when comparing agent YAML files.';
    }
  }

  if (hasModels) {
    if (!options.modelA || !options.modelB) {
      return 'Both --model-a and --model-b are required when comparing models.';
    }
  }

  return null;
}

async function runCompareAction(
  options: {
    agentA?: string;
    agentB?: string;
    modelA?: string;
    modelB?: string;
    scenario: string;
  },
  format?: string,
): Promise<void> {
  // Validate options
  const validationError = validateCompareOptions(options);
  if (validationError) {
    printError(validationError);
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();

  // Resolve scenario
  let scenarioId: string;
  try {
    scenarioId = await resolveScenarioId(options.scenario);
  } catch (err) {
    printError(formatError(err));
    process.exitCode = 1;
    return;
  }

  // Build adapter configs for A and B
  let labelA: string;
  let labelB: string;
  let modelA: string;
  let modelB: string;
  let adapterTypeA: string;
  let adapterConfigA: Record<string, any>;
  let adapterTypeB: string;
  let adapterConfigB: Record<string, any>;

  if (options.agentA && options.agentB) {
    // Agent YAML mode
    const agentDefA = loadAgentYaml(
      options.agentA,
      config.provider || undefined,
    );
    const agentDefB = loadAgentYaml(
      options.agentB,
      config.provider || undefined,
    );

    labelA = agentDefA.name;
    labelB = agentDefB.name;
    modelA = `${agentDefA.provider}:${agentDefA.model || agentDefA.httpEndpoint}`;
    modelB = `${agentDefB.provider}:${agentDefB.model || agentDefB.httpEndpoint}`;

    const configA = buildAdapterConfig(agentDefA, config);
    const configB = buildAdapterConfig(agentDefB, config);
    adapterTypeA = configA.adapterType;
    adapterConfigA = configA.adapterConfig;
    adapterTypeB = configB.adapterType;
    adapterConfigB = configB.adapterConfig;
  } else {
    // Model string mode
    const mA = options.modelA!;
    const mB = options.modelB!;

    const parsedA = parseModelString(mA, config.provider || undefined);
    const parsedB = parseModelString(mB, config.provider || undefined);

    labelA = `Model A`;
    labelB = `Model B`;
    modelA = parsedA.model || parsedA.httpEndpoint || mA;
    modelB = parsedB.model || parsedB.httpEndpoint || mB;

    const configA = buildAdapterConfigFromModel(mA, config);
    const configB = buildAdapterConfigFromModel(mB, config);
    adapterTypeA = configA.adapterType;
    adapterConfigA = configA.adapterConfig;
    adapterTypeB = configB.adapterType;
    adapterConfigB = configB.adapterConfig;
  }

  console.log('');
  console.log(
    chalk.bold('chanl compare') +
      chalk.dim(` \u2014 running ${options.scenario} against two models`),
  );
  console.log('');

  // Run A
  let executionA: any = null;
  let errorA: string | null = null;
  try {
    executionA = await executeAndWait(
      scenarioId,
      adapterTypeA,
      adapterConfigA,
      `Model A (${modelA})`,
    );
  } catch (err) {
    errorA = formatError(err);
    console.log(chalk.red(`  Model A failed: ${errorA}`));
  }

  // Run B
  let executionB: any = null;
  let errorB: string | null = null;
  try {
    executionB = await executeAndWait(
      scenarioId,
      adapterTypeB,
      adapterConfigB,
      `Model B (${modelB})`,
    );
  } catch (err) {
    errorB = formatError(err);
    console.log(chalk.red(`  Model B failed: ${errorB}`));
  }

  // Extract metrics
  const metricsA = extractMetrics(executionA);
  const metricsB = extractMetrics(executionB);

  // Determine winner
  const { winner, reason } = determineWinner(metricsA, metricsB);

  const result: ComparisonResult = {
    scenario: options.scenario,
    sideA: {
      label: labelA,
      model: modelA,
      execution: executionA,
      metrics: metricsA,
      error: errorA,
    },
    sideB: {
      label: labelB,
      model: modelB,
      execution: executionB,
      metrics: metricsB,
      error: errorB,
    },
    winner,
    winnerReason: reason,
  };

  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatComparisonTable(result));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
