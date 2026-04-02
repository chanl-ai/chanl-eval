# Changelog: API Config Centralization

**Date**: 2026-04-01
**Commits**: `eb98ce2`, `ddaec2a` (on branch `fix/ci-voice-handler-test-cleanup`)
**Problem**: "No LLM evaluator available. Using fallback value" — API keys resolved in 7 scattered places with different fallback chains

---

## New Files

| File | Purpose |
|------|---------|
| `packages/scenarios-core/src/execution/llm-config-resolver.ts` | Central 4-tier resolution chain (config → legacy → env → settings DB) |
| `packages/scenarios-core/src/execution/__tests__/llm-config-resolver.spec.ts` | 23 tests for resolver (both sync/async variants) |
| `packages/scenarios-core/src/execution/__tests__/llm-judge.spec.ts` | 12 tests for multi-provider judge |
| `packages/scenarios-core/src/execution/__tests__/persona-llm.spec.ts` | 10 tests for persona key resolution + env var fallback |
| `docs/architecture/api-key-resolution.md` | Architecture doc explaining the design |

## Modified Files

### `packages/scenarios-core/src/execution/judge-llm.ts`

**Before**: `buildOpenAiJudge(apiKey, model)` — OpenAI only, returns undefined for Anthropic users.

**After**: New `buildLlmJudge(config: ResolvedLlmConfig)` that branches on `config.kind`:
- OpenAI: `POST api.openai.com` with `Authorization: Bearer`
- Anthropic: `POST api.anthropic.com` with `x-api-key` + `anthropic-version`
- `buildOpenAiJudge` kept as deprecated alias

### `packages/scenarios-core/src/execution/persona-llm.ts`

**Before**: `resolvePersonaLlmKey()` had its own 3-step resolution (simulationApiKey → legacy fields → agent key). No env var fallback. No settings DB fallback.

**After**: Body replaced with one-liner `return resolveLlmConfigSync(adapterType, adapterConfig)`. Same return type `{kind, apiKey, model?}`, same callers — zero changes needed in strategies. Now gains env var fallback (tier 3).

### `packages/scenarios-core/src/execution/execution-processor.ts`

**Before** (lines 155-182): Inline key resolution with `process.env` checks + raw `this.scenarioModel.db.collection('settings').findOne({})` hack.

**After**: Calls `resolveLlmConfig(adapterType, data.adapterConfig, settingsLookup)` once. Settings lookup is a clean lambda wrapping the same DB query.

**Before** (lines 311-349): Judge key resolution via `resolvePersonaLlmKey()` → check if openai → fallback chain → `buildOpenAiJudge(openAiKeyForJudge)`.

**After**: `buildLlmJudge(resolvedConfig)` — uses the same resolved config, supports both providers.

### `packages/scenarios-core/src/scenarios/services/scenario-execution.service.ts`

**Before** (line 506-509):
```typescript
const judgeApiKey = dto.apiKey || process.env.OPENAI_API_KEY || undefined;
const llmEvaluate = buildOpenAiJudge(judgeApiKey);
```
Note: wrong env var name (`OPENAI_API_KEY` not `CHANL_OPENAI_API_KEY`).

**After**:
```typescript
const judgeConfig = resolveLlmConfigSync(undefined, dto.apiKey ? { apiKey: dto.apiKey } : undefined);
const llmEvaluate = buildLlmJudge(judgeConfig || undefined);
```

### `packages/scenarios-core/src/execution/index.ts`

**Added**:
```typescript
export * from './llm-config-resolver';
export { buildLlmJudge, buildOpenAiJudge } from './judge-llm';
```

### `packages/server/src/chat/chat.service.ts`

**Before**: `settingsService.getApiKey(adapterType)` — MongoDB only, no env var fallback.

**After**: `resolveLlmConfig(adapterType, adapterConfig, settingsLookup)` with `settingsLookup` wrapping `settingsService.getApiKey()`. Both `createSession` and `sendMessage` updated.

---

## What Was Fixed

| Before | After |
|--------|-------|
| Anthropic users get no judge (OpenAI-only) | Both providers work as judge |
| Env vars (`CHANL_OPENAI_API_KEY`) not seen by persona LLM | Persona LLM checks env vars via central resolver |
| Env vars not seen by chat playground | Chat playground checks env vars via central resolver |
| Wrong env var name in scenario-execution.service (`OPENAI_API_KEY`) | Correct name via central resolver (`CHANL_OPENAI_API_KEY`) |
| 7 independent resolution paths | 1 resolver, 2 variants (sync/async) |

## Test Results

- 45 new tests added
- 644 total tests passing across all packages
- Zero regressions in existing tests

## Post-Session Note

A subsequent session created `agent-config-resolver.ts` (a higher-level abstraction over Prompt entities) and made 63 uncommitted changes that rewired some consumers away from `resolveLlmConfig`. The `llm-config-resolver.ts` and `judge-llm.ts` core files remain intact. Verify that all consumers still go through the central resolver before committing the subsequent changes.
