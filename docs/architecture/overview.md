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

## Data Flow

A test run follows this pipeline:

```
1. Define           2. Execute           3. Capture           4. Evaluate          5. Report
┌──────────┐       ┌──────────┐        ┌──────────┐        ┌──────────┐        ┌──────────┐
│ Scenario │──────▶│ Persona  │───────▶│Transcript │──────▶│ Scorecard│───────▶│  Score   │
│ + Persona│       │ Simulator│        │ + Metrics │       │ Criteria │        │  Result  │
│ + Agent  │       │ + Agent  │        │           │       │ Handlers │        │          │
│ Config   │       │ Adapter  │        │           │       │          │        │          │
└──────────┘       └──────────┘        └──────────┘        └──────────┘        └──────────┘
```

**Step by step:**

1. **Define** -- A Scenario binds one or more Personas (simulated users) with one or more Agents (the AI under test), plus an optional Scorecard. Scenarios have a prompt that describes the situation (e.g., "frustrated customer with a billing issue").

2. **Execute** -- The PersonaSimulatorService converts persona traits into an LLM system prompt. The agent adapter connects to the agent under test (OpenAI, Anthropic, HTTP, or custom). The simulator and agent exchange messages in a conversation loop.

3. **Capture** -- The execution engine records the full transcript (segments with speaker labels, timestamps, duration) and interaction metrics (response times, talk time, silence gaps, interruptions, tool calls).

4. **Evaluate** -- The EvaluationService loads the scorecard, iterates over each active criterion, dispatches to the appropriate CriteriaHandler (prompt, keyword, response_time, etc.), and collects results.

5. **Report** -- Category scores are computed (weighted or simple averages), an overall score is calculated on a 0-10 scale, and a pass/fail determination is made against the scorecard's passing threshold.

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

**Registry pattern for extensibility.** Both agent adapters and criteria handlers use a registry pattern. You register implementations at startup and look them up by type string at runtime. This makes it trivial to add new adapter types or criteria handlers without modifying core code.

**Separation of core and server.** The `scenarios-core` and `scorecards-core` packages have no HTTP layer. They export NestJS modules with services, schemas, and DTOs. The `server` package composes them into a runnable application. This means you can embed the evaluation engine directly in your own NestJS application.

**Scorecard model hierarchy.** Scorecards use a three-level hierarchy: Scorecard -> Categories -> Criteria. Each category has a weight, and each criterion has a type, settings, and threshold. This structure supports both simple (3 criteria) and complex (50+ criteria across 10 categories) evaluation needs.

**Adapter-agnostic testing.** The `AgentAdapter` interface is minimal: `connect()`, `sendMessage()`, `disconnect()`. Any AI agent that can accept text and return text can be tested, regardless of provider.

## Server Configuration

The server runs on port 8005 by default (configurable via `PORT` environment variable). It requires:

- **MongoDB** -- Connection string via `MONGODB_URI` (default: `mongodb://localhost:27017/chanl-eval`)
- **Redis** -- Connection via `REDIS_URL` (default: `redis://localhost:6379`) for BullMQ job queues

API authentication uses API keys passed in the `X-API-Key` header.
