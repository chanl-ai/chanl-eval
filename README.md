<!-- Badges -->
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)]()
[![npm](https://img.shields.io/badge/npm-@chanl--ai%2Fcli-red.svg)]()

# chanl-eval

Open-source AI agent testing and evaluation engine. Define test scenarios with realistic personas, run them against any AI agent, and score the conversations with customizable scorecards.

## Quick Start

### 1. Start the Stack

```bash
git clone https://github.com/chanl-ai/chanl-eval.git
cd chanl-eval
pnpm install

# Start MongoDB + Redis
docker compose up -d

# Build all packages
pnpm build

# Start the server (port 18005)
cd packages/server && pnpm start:dev
```

### 2. Install the CLI

```bash
npm install -g @chanl-ai/cli
```

### 3. Configure

```bash
chanl config set server http://localhost:18005
chanl login
```

### 4. Run Your First Scenario

```bash
chanl scenarios run examples/angry-customer.yaml
```

Or via the API directly:

```bash
# Create a persona
curl -X POST http://localhost:18005/personas \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Frustrated Karen",
    "gender": "female",
    "emotion": "frustrated",
    "language": "english",
    "accent": "american",
    "intentClarity": "slightly unclear",
    "speechStyle": "fast",
    "backgroundNoise": false,
    "allowInterruptions": false,
    "createdBy": "dev"
  }'

# Create a scenario
curl -X POST http://localhost:18005/scenarios \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Billing Dispute",
    "prompt": "Customer was double-charged and wants a refund",
    "category": "support",
    "difficulty": "hard",
    "personaIds": ["<persona-id>"],
    "agentIds": ["<agent-id>"],
    "createdBy": "dev"
  }'
```

API docs are at [http://localhost:18005/api/docs](http://localhost:18005/api/docs).

## What It Does

**Scenarios** define test cases: a situation, a persona (simulated user), and the agent under test.

**Personas** simulate realistic users with configurable traits -- emotion (friendly, frustrated, hostile), speech style (fast, slow), cooperation level, patience, and more. The persona simulator converts these traits into LLM system prompts that drive natural conversation behavior.

**Scorecards** evaluate conversations using a hierarchy of categories and criteria. Seven built-in criteria types:

| Type | What It Measures |
|------|-----------------|
| `prompt` | LLM-as-judge evaluation (boolean or 0-10 score) |
| `keyword` | Keyword presence/absence in transcript |
| `response_time` | Agent response latency |
| `talk_time` | Speaking duration or talk ratio |
| `silence_duration` | Dead air in the conversation |
| `interruptions` | Overlapping speech count |
| `tool_call` | Whether expected tools were invoked |

**Agent Adapters** connect to any AI agent:

- **OpenAI** -- GPT-4o, GPT-4, GPT-3.5
- **Anthropic** -- Claude models
- **HTTP** -- Any REST endpoint
- Custom adapters via the `AgentAdapter` interface

## Architecture

```
chanl-eval/
├── packages/
│   ├── scenarios-core/    # Personas, scenarios, execution engine, agent adapters
│   ├── scorecards-core/   # Scorecards, criteria handlers, evaluation engine
│   ├── server/            # Standalone NestJS server (port 18005)
│   ├── cli/               # CLI tool ("chanl")
│   ├── sdk/               # TypeScript SDK
│   └── dashboard/         # React web UI (planned)
├── adapters/              # Community agent adapters
├── criteria-types/        # Community criteria type handlers
├── templates/             # Scenario templates
└── examples/              # Example scenarios
```

See [docs/architecture/overview.md](docs/architecture/overview.md) for the full architecture.

## Documentation

| Topic | Link |
|-------|------|
| Architecture Overview | [docs/architecture/overview.md](docs/architecture/overview.md) |
| Scorecard System | [docs/architecture/scorecards.md](docs/architecture/scorecards.md) |
| Agent Adapters | [docs/architecture/adapters.md](docs/architecture/adapters.md) |
| Criteria Types | [docs/architecture/criteria-types.md](docs/architecture/criteria-types.md) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |

## CLI Commands

```bash
chanl scenarios list                     # List all scenarios
chanl scenarios run <id>                 # Run a scenario by ID
chanl scenarios run <file.yaml>          # Run from YAML file
chanl personas list                      # List all personas
chanl personas create --name "Karen"     # Create a persona
chanl scorecards list                    # List all scorecards
chanl scorecards create --from-template customer-service
```

## Contributing

We welcome contributions -- new adapters, criteria types, templates, and core improvements. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

```bash
# Development workflow
pnpm install
docker compose up -d
pnpm build
pnpm test
```

## License

[MIT](LICENSE)
