[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

# chanl-eval

**Test AI agents locally** with scripted scenarios, simulated users (**personas**), full **transcripts**, and **scorecards**—including **LLM-as-judge** criteria (rubric-based scoring over the conversation). Bring your own API keys (BYOK) for the model under test and for providers used by simulators and judges.

Think of it as a structured harness for regression-style checks on agents: same scenario, repeatable runs, measurable outcomes. Criteria can cover latency, keywords, tool usage, and **prompt**-style evaluation where a model grades the agent against your rubric. If your stack uses **RAG**, you can judge whether answers stay grounded (e.g. via rubric text and transcript context in scorecard prompts)—see [docs/architecture/scorecards.md](docs/architecture/scorecards.md) for how criteria work.

## Quick start (local)

### 1. Dependencies and build

```bash
git clone https://github.com/chanl-ai/chanl-eval.git
cd chanl-eval
pnpm install

# MongoDB + Redis only (defaults: 27217 / 6479)
docker compose up -d

pnpm build
```

### 2. Run the API server

```bash
cd packages/server && pnpm start:dev
```

Server listens on **http://localhost:18005**. On **first** startup with an empty database, the log prints a **bootstrap API key** (save it). All non-health routes require header **`X-API-Key`**.

### 3. CLI from this repo (development)

```bash
cd packages/cli && pnpm link --global
chanl config set server http://localhost:18005
chanl login   # paste the bootstrap API key when prompted
chanl config set provider openai
chanl config set openaiApiKey sk-...   # key for the *agent under test*
```

### 4. Run a scenario

Seeded scenarios exist after first boot. Run by **slug** (no YAML required):

```bash
chanl scenarios run angry-customer-refund
```

Or import [examples/angry-customer.yaml](examples/angry-customer.yaml): set `personaIds` to a real id from `chanl personas list`, then:

```bash
chanl scenarios run examples/angry-customer.yaml
```

**API docs:** [http://localhost:18005/api/docs](http://localhost:18005/api/docs)

### Optional: Web dashboard (local)

Minimal UI on port **3000** using the same `@chanl/eval-sdk` as programmatic clients (no `platform-sdk`). Set **server URL**, **X-API-Key**, and (for **Run** on a scenario) an **OpenAI or Anthropic API key** for the agent under test.

```bash
# From repo root, after pnpm build
pnpm --filter @chanl/eval-dashboard dev
```

Open [http://localhost:3000](http://localhost:3000), complete **Settings**, then browse executions, scenarios, personas, and scorecards.

### API example (create resources)

Replace `YOUR_API_KEY` and use valid 24-character hex ids for `personaIds` / `agentIds` (see `chanl personas list`).

```bash
API_KEY=YOUR_API_KEY
curl -s -X POST http://localhost:18005/personas \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
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

curl -s -X POST http://localhost:18005/scenarios \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "name": "Billing Dispute",
    "prompt": "Customer was double-charged and wants a refund",
    "category": "support",
    "difficulty": "hard",
    "personaIds": ["<persona-id-from-list>"],
    "agentIds": ["507f1f77bcf86cd799439011"],
    "createdBy": "dev"
  }'
```

## What you get

| Piece | Role |
|-------|------|
| **Scenarios** | Situation + opening line; ties to personas and optional scorecard. |
| **Personas** | Traits (emotion, pace, cooperation) used to drive simulated user turns. |
| **Scorecards** | Categories and **criteria** (keyword, response time, **prompt** / LLM judge, tool calls, etc.). |
| **Adapters** | Connect the **agent under test** (OpenAI, Anthropic, HTTP, or custom). |

Details: [docs/architecture/overview.md](docs/architecture/overview.md), [adapters.md](docs/architecture/adapters.md), [scorecards.md](docs/architecture/scorecards.md), [criteria-types.md](docs/architecture/criteria-types.md).

## Layout

```
chanl-eval/
├── packages/
│   ├── scenarios-core/   # Scenarios, personas, execution, adapters
│   ├── scorecards-core/  # Scorecards and criteria handlers
│   ├── server/            # NestJS API (port 18005)
│   ├── cli/               # `chanl` CLI (link locally)
│   ├── sdk/               # TypeScript client for this API
│   └── dashboard/         # Next.js UI (local dev, `@chanl/eval-sdk` only)
├── examples/              # Sample scenario YAML
└── docs/
```

## Commands (CLI)

```bash
chanl scenarios list
chanl scenarios run <id-or-slug>
chanl scenarios run <file.yaml>
chanl personas list
chanl scorecards list
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
pnpm install
docker compose up -d
pnpm build
pnpm test
```

## License

[MIT](LICENSE)
