# Architecture Overview

chanl-eval is an open-source AI agent testing and evaluation engine. It lets you define test scenarios with realistic personas, execute them against any AI agent, and score the resulting conversations using customizable scorecards.

## Package Structure

```
chanl-eval/
├── packages/
│   ├── scenarios-core/    # Personas, scenarios, execution engine, agent adapters
│   ├── scorecards-core/   # Scorecards, criteria handlers, evaluation engine
│   ├── server/            # Standalone NestJS server (port 8005)
│   ├── cli/               # CLI tool ("chanl")
│   ├── sdk/               # TypeScript SDK (@chanl/eval-sdk)
│   └── dashboard/         # React web UI (planned)
├── adapters/              # Community agent adapters
├── criteria-types/        # Community criteria type handlers
├── templates/             # Scenario templates (YAML)
└── examples/              # Example scenario files
```

### How Packages Relate

```
┌─────────────────────────────────────────────────────────────┐
│                      Consumers                              │
│   ┌──────────┐    ┌──────────┐    ┌──────────────────┐      │
│   │   CLI    │    │ Dashboard│    │  SDK (external)  │      │
│   │ @chanl-  │    │ @chanl-  │    │  @chanl/      │      │
│   │ ai/cli   │    │ ai/      │    │  eval-sdk        │      │
│   └────┬─────┘    │ dashboard│    └────────┬─────────┘      │
│        │          └────┬─────┘             │                │
│        │               │                   │                │
│        └───────────────┼───────────────────┘                │
│                        ▼                                    │
│              ┌─────────────────┐                            │
│              │     Server      │  REST API (port 8005)      │
│              │ @chanl/      │  Swagger at /api/docs      │
│              │ eval-server     │                            │
│              └───────┬─────────┘                            │
│                      │                                      │
│           ┌──────────┴──────────┐                           │
│           ▼                     ▼                           │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ scenarios-core  │  │ scorecards-core │                  │
│  │ Personas,       │  │ Scorecards,     │                  │
│  │ Scenarios,      │  │ Criteria,       │                  │
│  │ Adapters,       │  │ Handlers,       │                  │
│  │ Simulator       │  │ Evaluation      │                  │
│  └─────────────────┘  └─────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

**scenarios-core** and **scorecards-core** are the engine. They contain all domain logic and can be used as standalone NestJS modules. The **server** wraps both cores into a deployable HTTP API. The **CLI** and **SDK** consume that API.

## Core Entities

| Entity | What It Is | Key Fields |
|--------|-----------|------------|
| **Prompt** | The agent under test | `content` (system prompt), `adapterConfig.adapterType`, `adapterConfig.model`, `adapterConfig.temperature`, `adapterConfig.maxTokens` |
| **Scenario** | A test case | `prompt` (situation description), `personaIds`, `scorecardId`, `groundTruth`, `personaStrategyType` |
| **Persona** | A simulated user | traits, emotion, behavior, cooperation, patience |
| **Scorecard** | How to score the conversation | categories, criteria, scoring algorithm, passing threshold |

**Prompt = agent config. Scenario = test case.** A Scenario has no reference to a Prompt or agent. The agent (Prompt) is chosen at run time -- in the playground UI, via CLI flag, or in the API request.

## Data Flow

```
1. Define           2. Resolve           3. Execute           4. Capture           5. Evaluate          6. Report
┌──────────┐       ┌──────────┐        ┌──────────┐        ┌──────────┐        ┌──────────┐        ┌──────────┐
│ Scenario │──────▶│ Prompt   │───────▶│ Persona  │───────▶│Transcript │──────▶│ Scorecard│───────▶│  Score   │
│ (test    │       │ → Agent  │        │ Simulator│        │ + Metrics │       │ Criteria │        │  Result  │
│  case)   │       │ Config   │        │ + Agent  │        │           │       │ Handlers │        │          │
│          │       │ Resolver │        │ Adapter  │        │           │       │          │        │          │
└──────────┘       └──────────┘        └──────────┘        └──────────┘        └──────────┘        └──────────┘
```

**Step by step:**

1. **Define** -- A Scenario describes a test situation with one or more Personas (simulated users), an optional Scorecard, and optional ground truth. Scenarios do not reference any agent or Prompt.

2. **Resolve** -- The execute request provides a `promptId`. The `AgentConfigResolver` loads the Prompt entity and builds a complete `AgentAdapterConfig` by merging the Prompt's settings with API keys resolved from environment variables and the Settings DB.

3. **Execute** -- The PersonaSimulatorService converts persona traits into an LLM system prompt. The agent adapter connects to the agent under test using the resolved config. The simulator and agent exchange messages in a conversation loop.

4. **Capture** -- The execution engine records the full transcript (segments with speaker labels, timestamps, duration) and interaction metrics (response times, talk time, silence gaps, interruptions, tool calls).

5. **Evaluate** -- The EvaluationService loads the scorecard, iterates over each active criterion, dispatches to the appropriate CriteriaHandler (prompt, keyword, response_time, etc.), and collects results.

6. **Report** -- Category scores are computed (weighted or simple averages), an overall score is calculated on a 0-10 scale, and a pass/fail determination is made against the scorecard's passing threshold.

## Execute Request Shape

There is one way to run a scenario:

```
POST /scenarios/:id/execute
{
  "promptId": "abc123"           // required -- the agent under test
  "personaId": "def456",         // optional -- override scenario's default persona
  "scorecardId": "ghi789",       // optional -- override scenario's default scorecard
  "toolFixtureIds": ["j", "k"],  // optional -- tool fixtures for the execution
  "parameters": { ... }          // optional -- prompt variable overrides
}
```

No `adapterConfig`, `adapterType`, or `agentId` on any request. The Prompt entity is the single source of agent configuration.

## Config Resolution Flow

```
Prompt entity (DB)          Settings (DB)
  ├─ content (system prompt)    └─ providerKeys (API keys)
  ├─ adapterConfig.adapterType         │
  ├─ adapterConfig.model               │
  ├─ adapterConfig.temperature         │
  └─ adapterConfig.maxTokens           │
         │                              │
         └──────────┬───────────────────┘
                    │
            AgentConfigResolver.resolve()
                    │
              ResolvedAgentConfig
              { adapterType, config: AgentAdapterConfig }
                    │
              adapter.connect(config)
```

`AgentConfigResolver` is used by both `ExecutionProcessor` (scenario simulation) and `ChatService` (playground chat). There is no other path to building adapter config.

## Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Runtime | Node.js >= 18 | Server runtime |
| Framework | NestJS 10 | HTTP server, dependency injection, modules |
| Database | MongoDB (Mongoose 7) | Scenarios, personas, scorecards, results |
| Queue | BullMQ 5 + Redis | Async scenario execution |
| API Docs | Swagger (NestJS Swagger 7) | Auto-generated at `/api/docs` |
| Validation | class-validator + class-transformer | DTO validation |
| Package Manager | pnpm workspaces | Monorepo management |
| Testing | Jest + mongodb-memory-server | Unit and integration tests |
| CLI | Commander + Chalk + Inquirer | Interactive command-line tool |

## Key Design Decisions

**One way in.** Every execution starts with `{ promptId }`. The `AgentConfigResolver` is the single source of truth for building adapter config from a Prompt entity + Settings DB. No inline `adapterConfig` on requests, no scattered key resolution.

**Registry pattern for extensibility.** Both agent adapters and criteria handlers use a registry pattern. You register implementations at startup and look them up by type string at runtime. This makes it trivial to add new adapter types or criteria handlers without modifying core code.

**Separation of core and server.** The `scenarios-core` and `scorecards-core` packages have no HTTP layer. They export NestJS modules with services, schemas, and DTOs. The `server` package composes them into a runnable application. This means you can embed the evaluation engine directly in your own NestJS application.

**Scorecard model hierarchy.** Scorecards use a three-level hierarchy: Scorecard -> Categories -> Criteria. Each category has a weight, and each criterion has a type, settings, and threshold. This structure supports both simple (3 criteria) and complex (50+ criteria across 10 categories) evaluation needs.

**Adapter-agnostic testing.** The `AgentAdapter` interface is minimal: `connect()`, `sendMessage()`, `disconnect()`. Any AI agent that can accept text and return text can be tested, regardless of provider.

## Server Configuration

The server runs on port 8005 by default (configurable via `PORT` environment variable). It requires:

- **MongoDB** -- Connection string via `MONGODB_URI` (default: `mongodb://localhost:27017/chanl-eval`)
- **Redis** -- Connection via `REDIS_URL` (default: `redis://localhost:6379`) for BullMQ job queues

API authentication uses API keys passed in the `X-API-Key` header.
