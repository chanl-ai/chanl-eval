# API Key Resolution

How chanl-eval resolves LLM provider API keys for agent adapters, persona simulation, and scorecard evaluation.

## Rule: One Place for Keys

**All API keys are resolved server-side. The dashboard never stores, manages, or sends LLM provider keys.**

- Agent keys → `AgentConfigResolver` (env vars → Settings DB)
- Persona keys → same resolved config
- Judge keys → same resolved config
- Dashboard → only sends `promptId` and `scorecardId` — never `apiKey`

If the server doesn't have a key, the operation fails with a clear error. No client-side fallback, no localStorage secrets, no split resolution paths.

## The Problem This Solves

chanl-eval needs API keys in three places during a scenario execution:

1. **Agent adapter** -- to call the agent being tested (OpenAI, Anthropic, or HTTP)
2. **Persona LLM** -- to generate realistic customer messages (separate from the agent)
3. **Judge LLM** -- to evaluate the transcript against scorecard criteria

All key resolution flows through `AgentConfigResolver`, the single source of truth for building adapter config. The resolver uses a 3-tier priority chain so users can provide keys through multiple channels without any consumer having its own resolution logic.

## Resolution Chain (AgentConfigResolver)

```
Tier 1: Overrides        Explicit per-execution override (rare)
  ↓ (if empty)
Tier 2: Environment       CHANL_OPENAI_API_KEY, CHANL_ANTHROPIC_API_KEY
  ↓ (if empty)
Tier 3: Settings DB       MongoDB settings.providerKeys (async callback)
```

**Output**: `ResolvedAgentConfig { adapterType: string, config: AgentAdapterConfig }`.

The resolved `config.apiKey` is then used by the agent adapter, the persona LLM, and the judge LLM. One resolution, three consumers.

## How Keys Reach the Resolver

```
Environment                     Settings DB
───────────                     ───────────
CHANL_OPENAI_API_KEY            PUT /settings → MongoDB
CHANL_ANTHROPIC_API_KEY         providerKeys collection
     │                               │
     ▼                               ▼
  ┌──────────────────────────────────────────────────────────┐
  │              AgentConfigResolver.resolve()                │
  │                                                          │
  │  Input:                                                  │
  │    prompt      = Prompt entity (system prompt + model)   │
  │    settingsLookup = async (provider) => key | undefined  │
  │                                                          │
  │  Resolution:                                             │
  │    tier 1: process.env.CHANL_*_API_KEY ──────────── ✓   │
  │    tier 2: settingsLookup('openai'|'anthropic') ──── ✓   │
  │                                                          │
  │  Output: { adapterType, config: AgentAdapterConfig }     │
  └──────────────────────────────────────────────────────────┘
  
Dashboard sends:  { promptId, scorecardId }  — never apiKey
CLI sends:        --prompt-id <id>           — never --api-key
```

No `adapterConfig` or `apiKey` on any request. The Prompt entity provides model/provider config, and keys come from env vars or the Settings DB.

## Judge LLM

The judge uses the same resolved API key as the agent adapter. `buildLlmJudge(config)` accepts a `ResolvedLlmConfig` and branches on `kind`:

- **OpenAI**: `POST https://api.openai.com/v1/chat/completions` with `Authorization: Bearer` header, `response_format: json_object`
- **Anthropic**: `POST https://api.anthropic.com/v1/messages` with `x-api-key` header, `anthropic-version: 2023-06-01`

Both use the same evaluation system prompt and return `{ result, passed, reasoning, evidence }`. Default models: `gpt-4o-mini` (OpenAI), `claude-3-5-haiku-20241022` (Anthropic).

If the resolved adapter type is `openai`, the judge uses the same key directly. If it is `anthropic`, the judge can use that key or fall back to an OpenAI key from the settings lookup.

## Persona LLM

The persona LLM (which generates simulated customer messages) also uses the resolved config. The `persona-llm.ts` module receives the adapter type and API key from the resolved config -- it does not resolve keys independently. In the tight conversation loop, `resolveLlmConfigSync()` provides fast synchronous access to tiers 1-2 without hitting the database.

## Key Files

| File | Role |
|------|------|
| `packages/scenarios-core/src/execution/agent-config-resolver.ts` | **Single source of truth** -- builds `AgentAdapterConfig` from Prompt + Settings |
| `packages/scenarios-core/src/execution/llm-config-resolver.ts` | Internal helper for sync/async LLM config resolution |
| `packages/scenarios-core/src/execution/judge-llm.ts` | Multi-provider judge builder |
| `packages/scenarios-core/src/execution/persona-llm.ts` | Persona key resolution (delegates to resolved config) |
| `packages/scenarios-core/src/execution/execution-processor.ts` | Wires resolver into execution flow |
| `packages/server/src/chat/chat.service.ts` | Wires resolver into chat playground |

## Adding a New Provider

1. Add env var check to `AgentConfigResolver.resolve()` tier 2 (e.g., `CHANL_GOOGLE_API_KEY`)
2. Add `kind: 'google'` to `ResolvedLlmConfig` type in `llm-config-resolver.ts`
3. Add a `buildGoogleJudge()` branch in `judge-llm.ts`
4. Add adapter in `adapters/` (separate from key resolution)
5. Add tests

## Tests

45 tests cover the resolution chain:
- `llm-config-resolver.spec.ts` -- 23 tests (all tiers, priority, edge cases)
- `llm-judge.spec.ts` -- 12 tests (both providers, errors, backwards compat)
- `persona-llm.spec.ts` -- 10 tests (delegation, env var fallback, priority)
