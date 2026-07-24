# chanl-eval — intern-feedback fixes + roadmap (2026-07-24)

**Source:** first-run report from an intern who ran chanl-eval from the Docker quickstart and executed the
Angry Customer scenario end-to-end (scored 75%; the judge correctly caught the agent leaking unfilled
template placeholders — literally `$XX per month` — to the customer).

Four observations were raised. **All four were verified against the code and all four are real.** One is
worse than reported. This doc is the fix plan + the roadmap that falls out of it.

---

## /goal

```
/goal chanl-eval's first run must succeed for a stranger. A developer who clones the repo, runs
`docker compose up`, pastes one API key into the UI, and hits Run gets a scored transcript — no
manual API calls, no reading source, no env-var archaeology. Everything downstream of that first run
(which provider you point at, how much the scoring costs, how much you trust the score) is a knob the
user controls, not a decision we hardcoded. Deterministic failures — template placeholders, system-prompt
leaks, PII — are caught by code for free and never billed to an LLM; the LLM is reserved for genuinely
fuzzy judgement, and when it IS used its verdict comes with a confidence you can audit against a human.
```

---

## Verified findings

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| ① | API key can't reach the engine from the UI | **REAL — P0, worse than reported** | see below |
| ② | Persona + judge pinned to OpenAI/Anthropic | **REAL** | `persona-llm.ts:37,51` · `judge-llm.ts:101,132` |
| ③ | Judge = one LLM call per criterion, no self-consistency | **REAL, plus a live bug** | `prompt.handler.ts:70` · `judge-llm.ts:70-79` |
| ④ | Placeholder/leak detection should be code, not LLM | **REAL — and the code already admits it** | `keyword.handler.ts:45` · `judge-llm.ts:32` |

### ① API key onboarding — the Docker quickstart has no working path

Not user error. There are three broken links in one chain:

1. **Intended design** — `packages/dashboard/lib/execute-scenario.ts:6` states the contract:
   *"API keys come from server-side Settings — never sent from the client."* The server implements it
   (`PUT /settings`, `GET /settings/keys/:provider`, `settings.providerKeys`), and the SDK exposes it
   (`client.settings.update()`).
2. **The dashboard never uses it.** `settings/page.tsx` routes `agentApiKey` / `simApiKey` / `apiKey`
   through `useEvalConfig` → **localStorage only**. There is not one caller of `client.settings.update()`
   in the dashboard. Three write-only fields.
3. **Docker passes nothing.** `docker-compose.yml`'s `server:` service sets `PORT`, `NODE_ENV`,
   `MONGODB_URI`, `REDIS_URL` — and no `CHANL_OPENAI_API_KEY` / `CHANL_ANTHROPIC_API_KEY`, no `env_file`.
   `README.md` quickstart is `docker compose up` → open `:3010`, with no key step at all.

The run path resolves keys from Settings DB → env (`scenario-execution.service.ts:509-528`,
`llm-config-resolver.ts:54-71`). Both are empty on a fresh Docker install and the UI can fill neither.
Hand-rolling `PUT /settings` was the only route. **This is the single biggest adoption blocker in the
repo** — a stranger's first run cannot succeed.

### ② Provider flexibility — agent free, simulation pinned

Correct as reported. The agent-under-test honors a custom endpoint (`openai.adapter.ts:23`,
`anthropic.adapter.ts:23` both accept `config.endpoint`; the dashboard exposes `agentBaseUrl`). But:

- **Persona** (`persona-llm.ts:37,51`) constructs `new OpenAIAdapter()` / `new AnthropicAdapter()` and
  never passes `endpoint`, so it silently falls back to the hardcoded default.
- **Judge** (`judge-llm.ts:101,132`) doesn't use the adapters at all — it raw-`fetch`es
  `https://api.openai.com/v1/chat/completions` / `https://api.anthropic.com/v1/messages`.
- `ResolvedLlmConfig` (`llm-config-resolver.ts:11-15`) has no `baseUrl` field, so there is nowhere to put one.

The README already advertises *"OpenAI, Anthropic, or any OpenAI-compatible endpoint (Ollama, Together,
vLLM, Azure). Separate config for the agent under test vs. the simulation LLM."* — true for the agent,
false for the simulation half. The fix is one field plus four call sites.

### ③ Judge reliability — and a bug that reads as a bad score

`PromptHandler` makes exactly one `llmEvaluate()` call per criterion (`prompt.handler.ts:70`), temp 0.2,
no retry, no sampling. Self-consistency and judge-vs-human agreement are unbuilt.

Separately, `parseJudgeResponse` (`judge-llm.ts:70-79`) catches malformed JSON and returns
`{ result: 5, passed: false, reasoning: 'LLM evaluation completed (response parsing failed).' }`. A parse
failure and a genuine mediocre score are nearly indistinguishable in the UI, and both count against the
run. Fix this first — it's cheap and it corrupts scores today.

### ④ Deterministic placeholder detection — the seam is already visible

`KeywordHandler` (`keyword.handler.ts:45`) is literal `String.includes` — no regex, no pattern library —
so it does **not** cover this today. Meanwhile the judge's system prompt (`judge-llm.ts:32`) reads:

> *"Be STRICT about template placeholders — if the agent outputs `[insert X here]`, `etc.]`, or similar
> unfilled templates, that is a FAILURE for clarity/resolution."*

The behaviour was band-aided into an LLM prompt because there was no code path for it. That's the
strongest possible confirmation the observation is right: a regex catches `$XX` and
`[Replace with pricing]` instantly, free, deterministically — and the LLM budget goes to actual judgement.

---

## Features

Independent — each ships as its own PR. Commits carry `Feature: <slug>` + `Epic: chanl-eval`.

| # | Feature | Slug | Layers | Status |
|---|---------|------|--------|--------|
| F1 | API key onboarding path | `onboarding-api-keys` | server env, dashboard, docs | done |
| F2 | Provider baseUrl for persona + judge | `simulation-baseurl` | scenarios-core, dashboard | done |
| F3 | Judge reliability (honest failures + self-consistency) | `judge-reliability` | scenarios-core, scorecards-core | done |
| F4 | Deterministic pattern/leak handler | `pattern-handler` | scorecards-core, seeds | done |
| F5 | Human-in-the-loop judge benchmarking | `judge-agreement` | scorecards-core, sdk, dashboard | done |

### F1 — `onboarding-api-keys`

- Settings page reads `GET /settings` for masked current state, writes `PUT /settings` via
  `client.settings.update()` on save. Keys stop living in localStorage.
- `docker-compose.yml`: pass `CHANL_OPENAI_API_KEY` / `CHANL_ANTHROPIC_API_KEY` through from the host
  (`${VAR:-}`) + ship `.env.example`.
- README quickstart gains the key step, both routes (env var **or** the Settings UI).
- Dashboard shows a "no LLM key configured" banner linking to Settings when neither source has one.

**AC:** fresh `docker compose up` with no env vars → paste key in Settings UI → Angry Customer scenario
runs and scores. Zero manual API calls. Verified in a browser, not headless.

### F2 — `simulation-baseurl`

- `baseUrl` added to `ResolvedLlmConfig` and both resolvers, sourced from
  `adapterConfig.simulationBaseUrl` → `CHANL_SIMULATION_BASE_URL` env.
- `persona-llm.ts` passes it as `endpoint` to the adapters; `judge-llm.ts` uses it instead of the literal host.
- Dashboard "Simulation LLM" card gains a Base URL field mirroring the agent card.

**AC:** persona dialogue **and** scorecard judging both run against one OpenAI-compatible endpoint
(Ollama / OpenRouter) with no OpenAI key present.

### F3 — `judge-reliability`

- Parse and HTTP failures are marked explicitly (error flag, honest reasoning) and retried once, instead
  of masquerading as `result: 5`.
- `selfConsistency: k` on prompt-criteria settings → k samples at non-zero temperature, majority vote for
  boolean / median for score, inter-sample agreement reported as `confidence`.
- `confidence` surfaced on criteria results through to the UI.

**AC:** unit tests for vote + median + agreement math; a `k=3` run displays per-criterion confidence; an
induced malformed-JSON response reports an error rather than a 5.

### F4 — `pattern-handler`

- New `CriteriaType.PATTERN` + `PatternHandler`: user-supplied regexes plus a built-in library —
  `placeholder`, `system_prompt_leak`, `pii`, `internal_ids`.
- Registered in `CriteriaHandlerRegistry`, exported from `handlers/index.ts`, added to seeded scorecards.

**AC:** a transcript containing `$XX per month` and `[Replace with pricing]` fails the criterion with
**zero LLM calls**, and the matched span is returned as evidence.

---

## Autonomous loops

Branch: `fix/eval-onboarding-and-scoring` in the chanl-eval **main tree** (no worktrees — a worktree breaks the
live dashboard dev server and hides changes from the browser).

**Status 2026-07-24:** F1–F4 are committed (`06626af`, `19926dc`, `5d035d6`), unpushed. Loop 1 below
therefore targets the *remaining* roadmap, not F1–F4.

**Loop 1 — build the next roadmap feature (self-paced):**
```
/loop Work the chanl-eval roadmap in ../chanl-eval per docs/plans/2026-07-24-eval-onboarding-and-scoring.md. F1-F4 are ALREADY committed on fix/eval-onboarding-and-scoring — do not redo them. Pick the next incomplete feature in wave order: W3 judge-agreement (store human labels per criterion, add a `chanl-eval judge-agreement` command reporting Cohen's kappa of LLM judge vs human), then W4 CI/CD (chanl.config.yaml, --ci exit codes, JUnit XML, regression vs baseline), then extend the pattern library. Implement it in the chanl-eval MAIN tree (never a worktree — it breaks the live dashboard dev server), run its unit tests AND exercise it against the live local stack (server :18005, dashboard :3010), and the moment it is genuinely green commit it to fix/eval-onboarding-and-scoring with `Feature: <slug>` and `Epic: chanl-eval` trailers — surface a one-line summary per commit, do NOT push. Honesty rule: never mark a feature done without pasting the real test/e2e output; if something fails or you are unsure, STOP and report — do not hack green, do not cut scope, do not say "needs a browser pass before merge" and move on. After each feature, STOP and ask before starting the next.
```

**Loop 2 — first-run regression watch (poll):**
```
/loop 30m Verify the chanl-eval cold-start contract in ../chanl-eval. From a clean state (docker compose down -v, then docker compose up -d mongodb redis, then a fresh server on :18005) with NO CHANL_OPENAI_API_KEY / CHANL_ANTHROPIC_API_KEY in the environment: confirm GET /settings reports hasAnyKey:false, then set a key ONLY through the same settings API the dashboard uses (PUT /settings) and confirm a seeded scenario run completes with a score and a populated scorecard. Paste the real result — the score, or the actual error. If it fails, say exactly which of the three links broke (dashboard write, server read, docker env passthrough) and stop. Never commit, never push.
```

**Closeout (explicit, not a loop):** on Dean's OK, push `fix/eval-onboarding-and-scoring` and open
per-feature PRs. Note `judge-llm.ts` is shared by `simulation-baseurl` and `judge-reliability`, so
those two cannot be sliced apart — they ship as one PR or stack.

---

## Roadmap beyond these fixes

The intern's report reframes priority. The prior roadmap (2026-04-10) led with voice testing, CI/CD, and
red-teaming — all written before the dashboard existed, and all downstream of a first run that works.

| Wave | Theme | Why now |
|------|-------|---------|
| **W0 — first run works** (F1) | Onboarding | A stranger's first run must succeed. Everything else is worthless until it does. |
| **W1 — cost + provider freedom** (F2) | Persona/judge on any OpenAI-compatible endpoint | Running local models for simulation collapses the cost of a full suite — the thing that makes 100-scenario runs practical. |
| **W2 — cheap checks before expensive ones** (F4) | Deterministic layer | Placeholder/leak/PII detection is free and instant. Extends naturally to an always-on pre-judge gate that fires whether or not the user configured the criterion. |
| **W3 — trustworthy scores** (F3) | Judge reliability | Self-consistency, then judge-vs-human agreement (`chanl-eval judge-agreement`, Cohen's kappa vs stored human labels). This is the differentiator vs Promptfoo/DeepEval — nobody publishes their judge's agreement rate. |
| **W4 — CI/CD** | `chanl.config.yaml`, `--ci` exit codes, JUnit XML, GitHub Action, regression vs baseline | Carried from the 2026-04-10 roadmap. Only meaningful once scores are trustworthy (W3) and cheap (W1/W2). |
| **W5 — red teaming** | `chanl redteam <agent>`, attack personas, leak/PII scorecards | The deterministic layer from W2 is the natural detector for the leak half. |
| **W6 — voice** | TTS/STT pipeline, voice adapters, voice metrics | Still the largest greenfield wedge (no OSS competitor), but the heaviest. Was P0 in April; it is not P0 while the text first-run is broken. |

**The reprioritisation, stated plainly:** voice was the April P0 because it was the biggest competitive
gap. It is not the P0 today — a repo whose quickstart cannot complete a first run does not have a
competitive-gap problem, it has an adoption problem. W0–W3 are all small. Voice stays the big bet, after.

---

## Architecture review — 2026-07-24

Audited against: no file over 500 LOC, DRY, testable, durable, scalable past one node.
Findings are recorded, **not fixed** — each needs a decision, and three of them change contracts.

### A1 — Stateful adapter singletons make concurrency unsafe (blocker for scale)

`AdapterRegistry` stores **one instance per type** (`adapter-registry.ts:10`). `OpenAIAdapter.connect()`
mutates `this.config` (`openai.adapter.ts:19`) and `disconnect()` blanks it (`:157`).
`execution-processor.ts:194` grabs that shared instance per job.

`queues.config.ts` declares `concurrency: 5` — and **that value is never wired to anything** (it is
referenced only by its own declaration). Bull therefore runs the default concurrency of 1, which is
the only reason this is not currently corrupting runs.

The moment concurrency rises above 1 in a process: job A's `connect()` overwrites job B's model, key
and endpoint, and A's `disconnect()` blanks the config while B is mid-conversation. That is
cross-run credential bleed, not just a data race.

Consequence for scale: you cannot raise per-node concurrency at all. Horizontal scale is possible
only by adding processes pinned to concurrency 1 — the expensive way to buy throughput.

**Fix:** make adapters stateless — pass config into `sendMessage` instead of holding it — which also
deletes the connect/disconnect lifecycle and makes them trivially testable. A registry `create(type)`
factory is the smaller change but keeps the lifecycle. Then wire `workerOptions.concurrency` for real,
or delete it so it stops advertising a capability that does not exist.

### A2 — Settings singleton has a check-then-create race

`settings.service.ts:26-28` does `findOne()` then `create({})` with no unique index and no upsert.
Two nodes booting together, or two concurrent first requests, create two settings documents.
`getApiKey` then reads `findOne()`, so which one answers is arbitrary — a key saved through the UI can
silently stop being found.

**Fix:** `findOneAndUpdate({}, { $setOnInsert: {} }, { upsert: true, new: true })` plus a unique index
on a constant discriminator field.

### A3 — Bootstrap seeding runs per node with no lock

`bootstrap.service.ts:27` seeds personas, scorecards and scenarios in `onApplicationBootstrap`. It
guards with "already exists" checks, which is the same check-then-act pattern as A2 — concurrent
replica boots can both pass the check. **Fix:** unique keys on seeded entities + upsert, or an
advisory lock.

### A4 — Retried jobs re-run the whole conversation

`defaultJobOptions.attempts: 3` with exponential backoff, and the processor sets `status: running`
with no guard for an already-completed execution. `stepResults` is `$set` from a fresh array, so a
retry at least does not duplicate the transcript — but a transient failure late in the job re-drives
every LLM turn and overwrites a previously good result. **Fix:** make the job idempotent — short-circuit
if the execution already has results, or make retries resume rather than restart.

### A5 — DRY: two implementations of "call an LLM"

`judge-llm.ts` hand-rolls `fetch` plus provider branching, entirely separate from the adapters the
persona path uses. Both now carry their own baseUrl handling. A fix applied to one will not reach the
other. Consolidating the judge onto the adapters (once A1 makes them stateless) removes the fork.

### A6 — A service reaches around its own abstraction into Mongo

`scenario-execution.service.ts:509` does
`this.executionModel.db.collection('settings').findOne({})` — bypassing `SettingsService` entirely,
duplicating resolution logic that now lives in `getApiKey()` / `getSimulationBaseUrl()`, and making
the judge path untestable without a live database. **This line was extended rather than fixed while
adding `simulationBaseUrl` in this batch** — worth correcting before it grows a third reader.

### A7 — 17 source files over 500 LOC

| File | LOC | Note |
|---|---|---|
| `server/scripts/seed/insurance-seed.ts` | 1315 | data, not logic — lowest priority |
| `dashboard/.../playground/page.tsx` | 1097 | one component doing config, run, and display |
| `cli/src/commands/scenarios.ts` | 859 | |
| `scorecards-core/scorecards.service.ts` | 799 | CRUD for four entities in one service |
| `sdk/src/types.ts` | 785 | single barrel of every type; grew ~90 lines this batch |
| `scenarios-core/.../scenario.service.ts` | 776 | |
| `scenarios-core/execution-processor.ts` | 695 | **the architectural one** — conversation loop + scoring + persistence + config resolution in one class |
| `dashboard/.../executions/[id]/page.tsx` | 666 | |

`execution-processor.ts` is the one worth splitting on its seams rather than by line count: the
conversation loop, the scoring hand-off, and persistence are three separable jobs.

### Suggested order

A2 and A3 are small, self-contained, and are correctness bugs today under replica boots.
A1 is the real blocker and unlocks A5. A6 is a ten-line fix. A4 needs a decision on retry semantics.
A7 follows A1 naturally, since making adapters stateless already carves up the processor.

## Architecture review, pass 2 — 2026-07-24 (testability + multi-node)

New ground only; A1–A7 above stand unchanged.

### B1 — A passing test is the reason the cold-start gap survived

`bootstrap.spec.ts:69` is named **"should seed all defaults on fresh DB"** and it passes. Prompts are
never seeded, so a fresh install cannot execute a scenario (`promptId must be a string`, 400).

The test cannot catch that, because it asserts on **mock calls** rather than resulting state:
`expect(mockPersonaService.createDefaultPersonas).toHaveBeenCalled()`,
`expect(mockScenarioService.createDefaultScenarios).toHaveBeenCalled()`. A seeder that is never
invoked has no mock to fail. The test encodes an incomplete definition of "all defaults" and then
guards that definition.

This is the most valuable finding of the audit: not "there is no test", but "there is a test, it is
green, and its shape makes the bug invisible". Any assertion written against a mock of the thing you
control can only prove you called what you already decided to call.

**Fix:** assert on state, not on calls — after bootstrap, query the DB and assert every collection a
first run needs is non-empty (including `prompts`). That test would have failed the day it was written.

### B2 — `ScenarioExecutionService` (689 LOC) has zero test references

Nothing imports it in any spec. It holds the judge key/baseUrl resolution, the direct
`db.collection('settings')` access from A6, and the scorecard evaluation entry point — i.e. the path
that decides whether a run gets scored at all. It is the most consequential untested file in the repo,
and it is the one this batch extended.

### B3 — `LabelsService` (248 LOC) has zero test references — added in this batch

The pure agreement maths got 29 tests; the service that writes the labels got none. Untested:
per-reviewer upsert uniqueness, the `agreed` derivation (including the within-1-point rule for
scores), and **the judge-verdict snapshot** — the mechanism that keeps agreement history from
rewriting itself when a run is re-evaluated.

The maths is the part that was testable without a database, so it is the part that got tested. That is
backwards: the snapshot is the piece whose silent failure corrupts data permanently, and a wrong kappa
is at least visible. Worth fixing before more labels accumulate under untested write semantics.

### B4 — `SettingsService` is only ever mocked, never exercised

Its single spec reference (`generation.spec.ts`) injects a mock. So the A2 check-then-create race and
the masked-value rejection guard added in this batch both ship with no test.

### B5 — Multi-node surface is narrower than assumed (recorded so nobody re-audits)

No SSE, no websockets, no in-memory session or request state anywhere in the server. Every `Map` found
is either request-scoped or a stateless registry (`CriteriaHandlerRegistry`, `PersonaStrategyRegistry`
hold stateless singletons and are safe to share).

The multi-node blockers are therefore exactly three, all already recorded: **A1** (stateful adapters),
**A2** (settings race), **A3** (bootstrap seed race). Nothing else in the request path is node-local.

### Through-line

B1 and B4 are the same defect at different sites: tests that assert against mocked collaborators
rather than observable state. That shape cannot catch an omission, which is precisely the failure mode
that shipped a quickstart nobody can complete. The highest-value test work here is not more coverage —
it is converting a handful of existing mock-assertions into state-assertions.

## Review log

| Date | Verdict | Notes |
|------|---------|-------|
| 2026-07-24 | FINDINGS VERIFIED — 4/4 real, ① worse than reported | Intern's Docker first-run report. ① traced to three broken links (dashboard localStorage-only, docker-compose no env, README no key step) against an intended server-Settings design already implemented in server + SDK. ④ confirmed by the judge system prompt hand-patching placeholder strictness that belongs in code. Roadmap re-ordered: onboarding/cost/determinism/trust ahead of voice. |
