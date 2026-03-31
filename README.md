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

Server listens on **http://localhost:18005**. By default, **`X-API-Key` is not required** (good for local use). Set **`CHANL_EVAL_REQUIRE_API_KEY=true`** when running the server to enforce API keys; on first boot with an empty database the log can still print a **bootstrap key** for that mode.

### 3. CLI from this repo (development)

```bash
cd packages/cli && pnpm link --global
chanl config set server http://localhost:18005
# Optional if the server has CHANL_EVAL_REQUIRE_API_KEY=true:
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

Minimal UI using the same `@chanl/eval-sdk` as programmatic clients (no `platform-sdk`). Defaults to port **3000**; use another port if that is taken (`pnpm exec next dev --port 3010` in `packages/dashboard`).

**Optional:** copy [`packages/dashboard/.env.example`](packages/dashboard/.env.example) to `packages/dashboard/.env.local` if you use `CHANL_EVAL_REQUIRE_API_KEY=true` (set `NEXT_PUBLIC_CHANL_EVAL_API_KEY`) or for **Run scenario** (`NEXT_PUBLIC_CHANL_EVAL_AGENT_API_KEY`).

```bash
# From repo root, after pnpm build
pnpm --filter @chanl/eval-dashboard dev
```

Open the printed local URL, then browse executions, scenarios, personas, and scorecards.

**Shortcuts:** `pnpm dev:server` and `pnpm dev:dashboard` (from repo root) start the API and the UI.

**If the dashboard shows “set API key” but you added `.env.local`:** restart `next dev` after editing env files, then hard-refresh the browser. If you ever cleared the key in Settings, an empty value was saved in `localStorage` and could override env until you paste a key again or clear site data for `localhost` (or use the fix in the latest `eval-config`).

**If the server fails with `EADDRINUSE` on port 18005:** another process is using that port — stop it or set `PORT=18006` (and point the dashboard at that URL).

**CLI via `.env`:** optional repo-root [`.env.example`](.env.example) — copy to `.env` and set `CHANL_API_KEY` / `CHANL_OPENAI_API_KEY` (loaded automatically when you run `chanl`; `~/.chanl/config.json` still overrides when set).

### API example (create resources)

Use valid 24-character hex ids for `personaIds` / `agentIds` (see `chanl personas list`). Omit `X-API-Key` unless the server has `CHANL_EVAL_REQUIRE_API_KEY=true`.

```bash
curl -s -X POST http://localhost:18005/personas \
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

curl -s -X POST http://localhost:18005/scenarios \
  -H "Content-Type: application/json" \
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
