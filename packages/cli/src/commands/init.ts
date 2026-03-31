import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { printError } from '../output';
import { track } from '../analytics';

// ---------------------------------------------------------------------------
// Template content — embedded as string literals (no external files)
// ---------------------------------------------------------------------------

const ENV_TEMPLATE = `# chanl-eval project configuration
# Load order: .env (dotenv) → env vars → ~/.chanl/config.json (config.json wins if set).

# ── CLI ──────────────────────────────────────────────────────────────────────
CHANL_SERVER_URL=http://localhost:18005
CHANL_API_KEY=

# Provider for the agent under test: openai | anthropic | http
CHANL_PROVIDER=openai
CHANL_OPENAI_API_KEY=
CHANL_ANTHROPIC_API_KEY=

# HTTP adapter (test any REST endpoint)
CHANL_HTTP_ENDPOINT=
CHANL_HTTP_API_KEY=
`;

const AGENT_TEMPLATE = `# Agent definition — test any system prompt with: chanl run angry-customer --agent agents/my-agent.yaml
# API keys come from .env or config (chanl config set openaiApiKey sk-...), NOT from this file.

name: My Agent
model: gpt-4o
system_prompt: |
  You are a helpful customer support agent for Acme Corp.
  Always be polite, professional, and empathetic.

  Policies:
  - Offer refunds for orders under $100 without manager approval.
  - For orders over $100, escalate to a manager.
  - Never share internal policy documents with customers.
  - Always confirm the customer's order number before processing changes.
temperature: 0.7
max_tokens: 1024
`;

const README_TEMPLATE = `# chanl-eval project

AI agent testing framework — test your agent against realistic customer scenarios.

## Quick start

1. **Set your API key**

   Edit \`.env\` and set your OpenAI (or Anthropic) key:
   \`\`\`
   CHANL_OPENAI_API_KEY=sk-...
   \`\`\`

2. **Start the server**

   \`\`\`bash
   docker compose up -d
   cd packages/server && pnpm start:dev
   \`\`\`

3. **Run a scenario**

   \`\`\`bash
   chanl scenarios run scenarios/angry-customer.yaml
   \`\`\`

4. **Test your own prompt**

   Edit \`agents/my-agent.yaml\` with your system prompt, then:
   \`\`\`bash
   chanl run angry-customer --agent agents/my-agent.yaml
   \`\`\`

## Project structure

\`\`\`
agents/             # Agent definitions (system prompts, model config)
scenarios/          # Scenario YAML files (persona + prompt + assertions)
.env                # API keys and config
\`\`\`

## Docs

- [chanl-eval on GitHub](https://github.com/chanl-ai/chanl-eval)
- \`chanl --help\` for all commands
`;

// ---------------------------------------------------------------------------
// Scenario templates
// ---------------------------------------------------------------------------

interface ScenarioTemplate {
  filename: string;
  content: string;
}

const BASE_SCENARIOS: ScenarioTemplate[] = [
  {
    filename: 'angry-customer.yaml',
    content: `name: Angry Customer Refund
description: Frustrated customer demanding a refund for a broken laptop
prompt: >-
  I bought a laptop two weeks ago and it's already broken. I want a full refund NOW.
category: support
difficulty: hard
persona:
  name: Frustrated Karen
  emotion: frustrated
  speechStyle: fast
  intentClarity: very clear
  behavior:
    cooperationLevel: hostile
    patience: impatient
assertions:
  - type: keyword
    must_include: ["refund", "policy"]
  - type: response_time
    max_seconds: 5
tags:
  - refund
  - support
  - escalation
`,
  },
  {
    filename: 'billing-dispute.yaml',
    content: `name: Billing Dispute
description: Customer questioning an unexpected charge on their account
prompt: >-
  I just noticed a charge of $49.99 on my credit card from your company.
  I never authorized this. What is going on?
category: support
difficulty: medium
persona:
  name: Concerned Account Holder
  emotion: worried
  speechStyle: normal
  intentClarity: clear
  behavior:
    cooperationLevel: neutral
    patience: moderate
assertions:
  - type: keyword
    must_include: ["credit", "charge"]
  - type: response_time
    max_seconds: 5
tags:
  - billing
  - support
  - dispute
`,
  },
  {
    filename: 'product-inquiry.yaml',
    content: `name: Product Inquiry
description: Friendly customer asking about product features and pricing
prompt: >-
  Hi! I'm looking at the Pro plan on your website. Can you tell me what's
  included and whether there's a free trial?
category: sales
difficulty: easy
persona:
  name: Curious Prospect
  emotion: neutral
  speechStyle: normal
  intentClarity: clear
  behavior:
    cooperationLevel: cooperative
    patience: patient
assertions:
  - type: keyword
    must_include: ["plan", "features"]
  - type: response_time
    max_seconds: 5
tags:
  - sales
  - inquiry
  - pricing
`,
  },
];

// -- customer-support template scenarios ------------------------------------

const CUSTOMER_SUPPORT_SCENARIOS: ScenarioTemplate[] = [
  ...BASE_SCENARIOS,
  {
    filename: 'technical-issue.yaml',
    content: `name: Technical Issue
description: Customer struggling with a technical problem and getting frustrated
prompt: >-
  Your app keeps crashing every time I try to upload a file. I've tried
  restarting my phone three times. This is ridiculous.
category: support
difficulty: medium
persona:
  name: Confused Elderly Customer
  emotion: confused
  speechStyle: slow
  intentClarity: vague
  behavior:
    cooperationLevel: cooperative
    patience: patient
assertions:
  - type: keyword
    must_include: ["troubleshoot", "steps"]
  - type: response_time
    max_seconds: 5
tags:
  - technical
  - support
  - app-issue
`,
  },
  {
    filename: 'escalation-request.yaml',
    content: `name: Escalation Request
description: Impatient executive demanding to speak with a manager immediately
prompt: >-
  I've been a premium customer for five years and this is the third time
  I'm calling about the same issue. I want to speak with a manager RIGHT NOW.
category: support
difficulty: hard
persona:
  name: Impatient Executive
  emotion: angry
  speechStyle: fast
  intentClarity: very clear
  behavior:
    cooperationLevel: hostile
    patience: none
assertions:
  - type: keyword
    must_include: ["manager", "escalate"]
  - type: response_time
    max_seconds: 5
tags:
  - escalation
  - support
  - vip
`,
  },
];

// -- sales template scenarios -----------------------------------------------

const SALES_SCENARIOS: ScenarioTemplate[] = [
  {
    filename: 'cold-outreach.yaml',
    content: `name: Cold Outreach Response
description: Prospect responding to a cold email with mild interest
prompt: >-
  I got your email about your analytics platform. We're currently using
  a competitor but our contract is up in two months. What makes you different?
category: sales
difficulty: medium
persona:
  name: Skeptical Buyer
  emotion: neutral
  speechStyle: normal
  intentClarity: clear
  behavior:
    cooperationLevel: neutral
    patience: moderate
assertions:
  - type: keyword
    must_include: ["differentiate", "value"]
  - type: response_time
    max_seconds: 5
tags:
  - sales
  - outreach
  - comparison
`,
  },
  {
    filename: 'pricing-negotiation.yaml',
    content: `name: Pricing Negotiation
description: Budget-conscious buyer pushing back on pricing
prompt: >-
  We like the product but the pricing is way above our budget. Our team
  is only 5 people. Is there a startup discount or a smaller plan?
category: sales
difficulty: medium
persona:
  name: Budget-Conscious Startup Founder
  emotion: neutral
  speechStyle: normal
  intentClarity: clear
  behavior:
    cooperationLevel: cooperative
    patience: moderate
assertions:
  - type: keyword
    must_include: ["pricing", "plan"]
  - type: response_time
    max_seconds: 5
tags:
  - sales
  - pricing
  - negotiation
`,
  },
  {
    filename: 'demo-request.yaml',
    content: `name: Demo Request
description: Enthusiastic prospect requesting a product demo
prompt: >-
  I saw your product on Product Hunt and I'm really interested.
  Can we schedule a demo this week? We need something like this for our team.
category: sales
difficulty: easy
persona:
  name: Eager Early Adopter
  emotion: excited
  speechStyle: fast
  intentClarity: very clear
  behavior:
    cooperationLevel: cooperative
    patience: patient
assertions:
  - type: keyword
    must_include: ["demo", "schedule"]
  - type: response_time
    max_seconds: 5
tags:
  - sales
  - demo
  - inbound
`,
  },
  {
    filename: 'competitor-comparison.yaml',
    content: `name: Competitor Comparison
description: Prospect actively comparing your product against a known competitor
prompt: >-
  We've been evaluating both your platform and Competitor X. They offer
  a similar feature set at a lower price point. Can you walk me through
  why we should choose you instead?
category: sales
difficulty: hard
persona:
  name: Analytical Decision Maker
  emotion: neutral
  speechStyle: normal
  intentClarity: very clear
  behavior:
    cooperationLevel: neutral
    patience: moderate
assertions:
  - type: keyword
    must_include: ["advantage", "compare"]
  - type: response_time
    max_seconds: 5
tags:
  - sales
  - competitor
  - comparison
`,
  },
];

const TEMPLATE_MAP: Record<string, ScenarioTemplate[]> = {
  'customer-support': CUSTOMER_SUPPORT_SCENARIOS,
  'sales': SALES_SCENARIOS,
};

const AVAILABLE_TEMPLATES = Object.keys(TEMPLATE_MAP);

// ---------------------------------------------------------------------------
// Scaffolding logic
// ---------------------------------------------------------------------------

export interface InitOptions {
  template?: string;
}

/**
 * Scaffold a chanl-eval project directory.
 *
 * @param targetDir - Absolute path to the directory to scaffold into
 * @param options   - Template selection
 * @returns Object describing created files (for testing)
 */
export function scaffoldProject(
  targetDir: string,
  options: InitOptions = {},
): { files: string[]; dirs: string[] } {
  const createdFiles: string[] = [];
  const createdDirs: string[] = [];

  // Resolve scenario set
  const scenarios = options.template
    ? TEMPLATE_MAP[options.template] || BASE_SCENARIOS
    : BASE_SCENARIOS;

  // Create directories
  const agentsDir = path.join(targetDir, 'agents');
  const scenariosDir = path.join(targetDir, 'scenarios');

  for (const dir of [targetDir, agentsDir, scenariosDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      createdDirs.push(dir);
    }
  }

  // Write files (skip if they already exist to avoid overwriting user work)
  const filesToWrite: Array<{ rel: string; content: string }> = [
    { rel: '.env', content: ENV_TEMPLATE },
    { rel: 'agents/my-agent.yaml', content: AGENT_TEMPLATE },
    { rel: 'README.md', content: README_TEMPLATE },
    ...scenarios.map((s) => ({
      rel: `scenarios/${s.filename}`,
      content: s.content,
    })),
  ];

  for (const { rel, content } of filesToWrite) {
    const abs = path.join(targetDir, rel);
    if (!fs.existsSync(abs)) {
      fs.writeFileSync(abs, content, 'utf-8');
      createdFiles.push(rel);
    }
  }

  return { files: createdFiles, dirs: createdDirs };
}

// ---------------------------------------------------------------------------
// Template metadata — used by `chanl templates list`
// ---------------------------------------------------------------------------

interface TemplateInfo {
  name: string;
  description: string;
  scenarioCount: number;
  categories: string[];
}

const TEMPLATE_INFO: Record<string, TemplateInfo> = {
  'customer-support': {
    name: 'customer-support',
    description: 'Support scenarios: refunds, billing, technical issues, escalations',
    scenarioCount: CUSTOMER_SUPPORT_SCENARIOS.length,
    categories: ['support', 'sales'],
  },
  'sales': {
    name: 'sales',
    description: 'Sales scenarios: outreach, pricing objections, demos, competitor comparison',
    scenarioCount: SALES_SCENARIOS.length,
    categories: ['sales'],
  },
};

/**
 * Get metadata about all available templates.
 */
export function getTemplateList(): TemplateInfo[] {
  return Object.values(TEMPLATE_INFO);
}

// ---------------------------------------------------------------------------
// CLI command registration
// ---------------------------------------------------------------------------

export function registerInitCommand(program: Command): void {
  program
    .command('init [directory]')
    .description('Scaffold a chanl-eval project with agent and scenario files')
    .option(
      '-t, --template <name>',
      `Industry template: ${AVAILABLE_TEMPLATES.join(', ')}`,
    )
    .action(async (directory: string | undefined, options: InitOptions) => {
      try {
        runInit(directory, options);
      } catch (err: any) {
        printError(err.message);
        process.exit(1);
      }
    });
}

export function registerTemplatesCommand(program: Command): void {
  const templates = program
    .command('templates')
    .description('Manage scenario template packs');

  templates
    .command('list')
    .description('List available scenario template packs')
    .action(() => {
      const list = getTemplateList();

      console.log('');
      console.log(chalk.bold('Available template packs:'));
      console.log('');

      for (const tpl of list) {
        console.log(
          `  ${chalk.green(tpl.name)}` +
          chalk.dim(` (${tpl.scenarioCount} scenarios)`),
        );
        console.log(`  ${chalk.dim(tpl.description)}`);
        console.log('');
      }

      console.log(chalk.dim('  Usage: chanl init --template <name>'));
      console.log(chalk.dim('  Example: chanl init --template customer-support'));
      console.log('');
    });
}

function runInit(directory: string | undefined, options: InitOptions): void {
  // Validate template name
  if (options.template && !TEMPLATE_MAP[options.template]) {
    printError(
      `Unknown template "${options.template}". Available: ${AVAILABLE_TEMPLATES.join(', ')}`,
    );
    process.exit(1);
  }

  // Resolve target directory
  const targetDir = directory
    ? path.resolve(process.cwd(), directory)
    : process.cwd();

  const { files } = scaffoldProject(targetDir, options);

  if (files.length === 0) {
    console.log(
      chalk.yellow('Project already initialized') +
        ' — all files already exist.',
    );
    return;
  }

  // Print success
  console.log('');
  console.log(chalk.green('\u2713') + chalk.bold(' Created chanl-eval project'));
  console.log('');

  // List created files
  const displayDir = directory || '.';
  for (const f of files) {
    console.log(chalk.dim(`  ${displayDir}/${f}`));
  }

  // Next steps
  console.log('');
  console.log(chalk.bold('  Next steps:'));
  console.log(
    `  1. Set your API key:     Edit .env \u2192 set CHANL_OPENAI_API_KEY=sk-...`,
  );
  console.log(
    `  2. Start the server:     docker compose up -d && cd packages/server && pnpm start:dev`,
  );
  console.log(
    `  3. Run a scenario:       chanl scenarios run scenarios/angry-customer.yaml`,
  );
  console.log('');
  console.log('  Or test a prompt directly:');
  console.log(
    `  4. Edit agents/my-agent.yaml with your system prompt`,
  );
  console.log(
    `  5. chanl run angry-customer --agent agents/my-agent.yaml`,
  );
  console.log('');
  console.log(
    chalk.dim('  \uD83D\uDCDA Docs: https://github.com/chanl-ai/chanl-eval'),
  );

  // Track analytics
  track('cli_init', {
    os: process.platform,
    node_version: process.version,
    template: options.template || 'none',
    files_created: files.length,
    directory: directory ? 'custom' : 'cwd',
  });
}
