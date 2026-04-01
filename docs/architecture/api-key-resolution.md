# API Key Resolution

How chanl-eval resolves LLM provider API keys for agent adapters, persona simulation, and scorecard evaluation.

## The Problem This Solves

chanl-eval needs API keys in three places during a scenario execution:

1. **Agent adapter** — to call the agent being tested (OpenAI, Anthropic, or HTTP)
2. **Persona LLM** — to generate realistic customer messages (separate from the agent)
3. **Judge LLM** — to evaluate the transcript against scorecard criteria

Users can provide keys through multiple channels: CLI config, environment variables, dashboard settings, or directly in the execution request. Before centralization, each consumer had its own resolution logic with different fallback chains — persona LLM didn't check env vars, the judge was OpenAI-only, and the chat playground didn't check env vars either. This caused "No LLM evaluator available" errors when keys existed but the wrong resolver was looking.

## Resolution Chain

All key resolution goes through `llm-config-resolver.ts` with a single 4-tier priority chain:

```
Tier 1: Explicit config     adapterConfig.apiKey (from CLI/dashboard/API)
  ↓ (if empty)
Tier 2: Simulation keys     adapterConfig.simulationApiKey + legacy fields
  ↓ (if empty)                (personaLlmApiKey, personaOpenAiKey, openaiApiKey)
Tier 3: Environment vars    CHANL_OPENAI_API_KEY, CHANL_ANTHROPIC_API_KEY
  ↓ (if empty)
Tier 4: Settings DB         MongoDB settings.providerKeys (async callback)
```

**Output**: `{ kind: 'openai' | 'anthropic', apiKey: string, model?: string }` or `null`.

## Two Variants

| Function | Tiers | Async | Used By |
|----------|-------|-------|---------|
| `resolveLlmConfigSync()` | 1-3 | No | persona-llm, persona strategies |
| `resolveLlmConfig()` | 1-4 | Yes | ExecutionProcessor, ChatService |

The sync variant exists because persona strategies are called in tight loops during conversation generation — they shouldn't await a DB query on every turn. The async variant adds tier 4 for top-level orchestration code that runs once per execution.

## Call Graph

```
                    llm-config-resolver.ts
                   ┌──────────────────────┐
                   │ resolveLlmConfigSync  │ ← tiers 1-3
                   │ resolveLlmConfig      │ ← tiers 1-4
                   └──────────┬───────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
    persona-llm.ts    execution-processor.ts   chat.service.ts
    resolvePersonaLlmKey()  resolveLlmConfig()   resolveLlmConfig()
          │                   │                   │
    ┌─────┴─────┐       ┌────┴────┐         (settings callback)
    │           │       │         │
  default    reactive  agent    judge
  strategy   strategy  adapter  buildLlmJudge()
```

Additionally, `scenario-execution.service.ts` uses `resolveLlmConfigSync()` for manual re-evaluation.

## Judge LLM — Multi-Provider

`buildLlmJudge(config)` accepts a `ResolvedLlmConfig` and branches on `kind`:

- **OpenAI**: `POST https://api.openai.com/v1/chat/completions` with `Authorization: Bearer` header, `response_format: json_object`
- **Anthropic**: `POST https://api.anthropic.com/v1/messages` with `x-api-key` header, `anthropic-version: 2023-06-01`

Both use the same evaluation system prompt and return `{ result, passed, reasoning, evidence }`. Default models: `gpt-4o-mini` (OpenAI), `claude-3-5-haiku-20241022` (Anthropic).

The deprecated `buildOpenAiJudge(apiKey, model)` is kept as a thin wrapper for backwards compatibility.

## How Keys Reach the Resolver

```
CLI user                    Dashboard user              Server-side
─────────                   ──────────────              ───────────
~/.chanl/config.json        Settings page → API         .env file
     │                           │                          │
     ▼                           ▼                          ▼
CLI reads config            PUT /settings             CHANL_OPENAI_API_KEY
     │                      (stored in MongoDB)        CHANL_ANTHROPIC_API_KEY
     ▼                           │                          │
POST /scenarios/:id/execute      │                          │
  { adapterType, adapterConfig } │                          │
     │                           │                          │
     ▼                           ▼                          ▼
  ┌──────────────────────────────────────────────────────────┐
  │              resolveLlmConfig()                          │
  │  tier 1: adapterConfig.apiKey ────────────────────── ✓   │
  │  tier 2: adapterConfig.simulationApiKey ──────────── ✓   │
  │  tier 3: process.env.CHANL_*_API_KEY ─────────────── ✓   │
  │  tier 4: settingsLookup('openai'|'anthropic') ────── ✓   │
  └──────────────────────────────────────────────────────────┘
```

## Key Files

| File | Role |
|------|------|
| `packages/scenarios-core/src/execution/llm-config-resolver.ts` | Central resolver (the source of truth) |
| `packages/scenarios-core/src/execution/judge-llm.ts` | Multi-provider judge builder |
| `packages/scenarios-core/src/execution/persona-llm.ts` | Persona key resolution (delegates to resolver) |
| `packages/scenarios-core/src/execution/execution-processor.ts` | Wires resolver into execution flow |
| `packages/server/src/chat/chat.service.ts` | Wires resolver into chat playground |
| `packages/scenarios-core/src/scenarios/services/scenario-execution.service.ts` | Manual re-evaluation |

## Adding a New Provider

1. Add env var check to `resolveLlmConfigSync()` tier 3 (e.g., `CHANL_GOOGLE_API_KEY`)
2. Add `kind: 'google'` to `ResolvedLlmConfig` type
3. Add a `buildGoogleJudge()` branch in `judge-llm.ts`
4. Add adapter in `adapters/` (separate from key resolution)
5. Add tests in `__tests__/llm-config-resolver.spec.ts` and `__tests__/llm-judge.spec.ts`

## Tests

45 tests cover the resolution chain:
- `llm-config-resolver.spec.ts` — 23 tests (all tiers, priority, edge cases)
- `llm-judge.spec.ts` — 12 tests (both providers, errors, backwards compat)
- `persona-llm.spec.ts` — 10 tests (delegation, env var fallback, priority)
