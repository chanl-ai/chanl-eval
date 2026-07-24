# chanl-eval — onboarding and scoring fixes + roadmap (2026-07-24)

**Baseline reproduction:** a cold first run from the Docker quickstart, executing the Angry Customer
scenario end to end. Result: 75%. The judge correctly failed the agent for leaking unfilled template
placeholders (literally `$XX per month`) to the customer.

Four defects were identified and verified against the code. This document is the fix plan and the
roadmap that follows from it.

---

## Objective

chanl-eval's first run must succeed for a new user. A developer who clones the repo, runs
`docker compose up`, pastes one API key into the UI, and hits Run gets a scored transcript — no manual
API calls, no reading source, no environment-variable archaeology.

Everything downstream of that first run (which provider you point at, what scoring costs, how much you
trust the score) is a knob the user controls, not a hardcoded decision. Deterministic failures —
template placeholders, system-prompt leaks, PII — are caught by code for free and never billed to an
LLM. The LLM is reserved for genuinely fuzzy judgement, and when it is used its verdict carries a
confidence value that can be audited against a human.

---

## Verified findings

| # | Finding | Status | Evidence |
|---|---------|--------|----------|
| ① | API key cannot reach the engine from the UI | **REAL — P0** | see below |
| ② | Persona + judge pinned to OpenAI/Anthropic | **REAL** | `persona-llm.ts:37,51` · `judge-llm.ts:101,132` |
| ③ | Judge = one LLM call per criterion, no self-consistency | **REAL, plus a live bug** | `prompt.handler.ts:70` · `judge-llm.ts:70-79` |
| ④ | Placeholder/leak detection belongs in code, not the LLM | **REAL** | `keyword.handler.ts:45` · `judge-llm.ts:32` |

### ① API key onboarding — the Docker quickstart has no working path

Three broken links in one chain:

1. **Intended design** — `packages/dashboard/lib/execute-scenario.ts:6` states the contract:
   *"API keys come from server-side Settings — never sent from the client."* The server implements it
   (`PUT /settings`, `GET /settings/keys/:provider`, `settings.providerKeys`), and the SDK exposes it
   (`client.settings.update()`).
2. **The dashboard never uses it.** `settings/page.tsx` routes `agentApiKey` / `simApiKey` / `apiKey`
   through `useEvalConfig` → **localStorage only**. There is no caller of `client.settings.update()`
   in the dashboard. Three write-only fields.
3. **Docker passes nothing.** `docker-compose.yml`'s `server:` service sets `PORT`, `NODE_ENV`,
   `MONGODB_URI`, `REDIS_URL` — and no `CHANL_OPENAI_API_KEY` / `CHANL_ANTHROPIC_API_KEY`, no `env_file`.
   The `README.md` quickstart is `docker compose up` → open `:3010`, with no key step.

The run path resolves keys from Settings DB → env (`scenario-execution.service.ts:509-528`,
`llm-config-resolver.ts:54-71`). Both are empty on a fresh Docker install and the UI can fill neither.
Hand-rolling `PUT /settings` is the only route. A fresh Docker install cannot complete a first run.

### ② Provider flexibility — agent free, simulation pinned

The agent-under-test honors a custom endpoint (`openai.adapter.ts:23`, `anthropic.adapter.ts:23` both
accept `config.endpoint`; the dashboard exposes `agentBaseUrl`). The simulation half does not:

- **Persona** (`persona-llm.ts:37,51`) constructs `new OpenAIAdapter()` / `new AnthropicAdapter()` and
  never passes `endpoint`, so it falls back to the hardcoded default.
- **Judge** (`judge-llm.ts:101,132`) does not use the adapters at all — it raw-`fetch`es
  `https://api.openai.com/v1/chat/completions` / `https://api.anthropic.com/v1/messages`.
- `ResolvedLlmConfig` (`llm-config-resolver.ts:11-15`) has no `baseUrl` field, so there is nowhere to
  put one.

The README advertises *"OpenAI, Anthropic, or any OpenAI-compatible endpoint (Ollama, Together, vLLM,
Azure). Separate config for the agent under test vs. the simulation LLM."* That is true for the agent
and false for the simulation half. The fix is one field plus four call sites.

### ③ Judge reliability — plus a bug that reads as a bad score

`PromptHandler` makes exactly one `llmEvaluate()` call per criterion (`prompt.handler.ts:70`), temp 0.2,
no retry, no sampling. Self-consistency and judge-vs-human agreement are unbuilt.

Separately, `parseJudgeResponse` (`judge-llm.ts:70-79`) catches malformed JSON and returns
`{ result: 5, passed: false, reasoning: 'LLM evaluation completed (response parsing failed).' }`. A
parse failure and a genuine mediocre score are nearly indistinguishable in the UI, and both count
against the run. This corrupts scores today and is cheap to fix.

### ④ Deterministic placeholder detection

`KeywordHandler` (`keyword.handler.ts:45`) is literal `String.includes` — no regex, no pattern library —
so it does not cover this case. The judge's system prompt (`judge-llm.ts:32`) reads:

> *"Be STRICT about template placeholders — if the agent outputs `[insert X here]`, `etc.]`, or similar
> unfilled templates, that is a FAILURE for clarity/resolution."*

`judge-llm.ts` encodes placeholder strictness in its system prompt, indicating the failure mode was
known but had no deterministic code path. A regex catches `$XX` and `[Replace with pricing]` instantly,
free, and deterministically, leaving the LLM budget for actual judgement.

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
- `persona-llm.ts` passes it as `endpoint` to the adapters; `judge-llm.ts` uses it instead of the
  literal host.
- Dashboard "Simulation LLM" card gains a Base URL field mirroring the agent card.

**AC:** persona dialogue **and** scorecard judging both run against one OpenAI-compatible endpoint
(Ollama / OpenRouter) with no OpenAI key present.

### F3 — `judge-reliability`

- Parse and HTTP failures are marked explicitly (error flag, honest reasoning) and retried once,
  instead of masquerading as `result: 5`.
- `selfConsistency: k` on prompt-criteria settings → k samples at non-zero temperature, majority vote
  for boolean / median for score, inter-sample agreement reported as `confidence`.
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

## Branch and delivery

Branch: `fix/eval-onboarding-and-scoring`, developed in the chanl-eval **main tree**. A worktree breaks
the live dashboard dev server and hides changes from the browser, so it is not usable here.

**Status 2026-07-24:** F1–F4 are committed (`06626af`, `19926dc`, `5d035d6`), unpushed.

`judge-llm.ts` is shared by `simulation-baseurl` (F2) and `judge-reliability` (F3), so those two cannot
be sliced apart — they ship as one PR or as a stack.

### Cold-start verification procedure

Run this against a clean state to confirm the first-run contract still holds:

1. `docker compose down -v`, then `docker compose up -d mongodb redis`, then start a fresh server on
   `:18005` with no `CHANL_OPENAI_API_KEY` / `CHANL_ANTHROPIC_API_KEY` in the environment.
2. Confirm `GET /settings` reports `hasAnyKey: false`.
3. Set a key **only** through `PUT /settings` — the same API the dashboard uses.
4. Confirm a seeded scenario run completes with a score and a populated scorecard.

A failure at any step identifies which of the three links from finding ① has regressed: dashboard write,
server read, or Docker env passthrough.

---

## Roadmap

Priority order relative to the 2026-04-10 roadmap, which led with voice testing, CI/CD, and red-teaming
— all written before the dashboard existed, and all downstream of a first run that works.

| Wave | Theme | Why now |
|------|-------|---------|
| **W0 — first run works** (F1) | Onboarding | A new user's first run must succeed. Everything else is worthless until it does. |
| **W1 — cost + provider freedom** (F2) | Persona/judge on any OpenAI-compatible endpoint | Running local models for simulation collapses the cost of a full suite, which is what makes 100-scenario runs practical. |
| **W2 — cheap checks before expensive ones** (F4) | Deterministic layer | Placeholder/leak/PII detection is free and instant. Extends naturally to an always-on pre-judge gate that fires whether or not the user configured the criterion. Remaining work: extend the built-in pattern library. |
| **W3 — trustworthy scores** (F3) | Judge reliability | Self-consistency, then judge-vs-human agreement (`chanl-eval judge-agreement`, Cohen's kappa vs stored human labels). This is the differentiator vs Promptfoo/DeepEval — nobody publishes their judge's agreement rate. |
| **W4 — CI/CD** | `chanl.config.yaml`, `--ci` exit codes, JUnit XML, GitHub Action, regression vs baseline | Carried from the 2026-04-10 roadmap. Only meaningful once scores are trustworthy (W3) and cheap (W1/W2). |
| **W5 — red teaming** | `chanl redteam <agent>`, attack personas, leak/PII scorecards | The deterministic layer from W2 is the natural detector for the leak half. |
| **W6 — voice** | TTS/STT pipeline, voice adapters, voice metrics | Still the largest greenfield wedge (no OSS competitor), and the heaviest. |

Voice was the April P0 because it was the biggest competitive gap. It ranks below W0–W3 now: those are
all small, and a repo whose quickstart cannot complete a first run has an adoption problem, not a
competitive-gap problem. Voice stays the big bet, after.

---

## Architecture findings

Audited against: no file over 500 LOC, DRY, testable, durable, scalable past one node. Findings are
recorded, **not fixed** — each needs a decision, and three of them change contracts.

### Concurrency, DRY, and file size

#### A1 — Stateful adapter singletons make concurrency unsafe (blocker for scale)

`AdapterRegistry` stores **one instance per type** (`adapter-registry.ts:10`). `OpenAIAdapter.connect()`
mutates `this.config` (`openai.adapter.ts:19`) and `disconnect()` blanks it (`:157`).
`execution-processor.ts:194` grabs that shared instance per job.

`queues.config.ts` declares `concurrency: 5`, and that value is never wired to anything — it is
referenced only by its own declaration. Bull therefore runs the default concurrency of 1, which is the
only reason this is not currently corrupting runs.

The moment concurrency rises above 1 in a process: job A's `connect()` overwrites job B's model, key
and endpoint, and A's `disconnect()` blanks the config while B is mid-conversation. That is cross-run
credential bleed, not just a data race.

Consequence for scale: per-node concurrency cannot be raised at all. Horizontal scale is possible only
by adding processes pinned to concurrency 1 — the expensive way to buy throughput.

**Fix:** make adapters stateless — pass config into `sendMessage` instead of holding it — which also
deletes the connect/disconnect lifecycle and makes them trivially testable. A registry `create(type)`
factory is the smaller change but keeps the lifecycle. Then wire `workerOptions.concurrency` for real,
or delete it so it stops advertising a capability that does not exist.

#### A2 — Settings singleton has a check-then-create race

`settings.service.ts:26-28` does `findOne()` then `create({})` with no unique index and no upsert. Two
nodes booting together, or two concurrent first requests, create two settings documents. `getApiKey`
then reads `findOne()`, so which one answers is arbitrary — a key saved through the UI can silently
stop being found.

**Fix:** `findOneAndUpdate({}, { $setOnInsert: {} }, { upsert: true, new: true })` plus a unique index
on a constant discriminator field.

#### A3 — Bootstrap seeding runs per node with no lock

`bootstrap.service.ts:27` seeds personas, scorecards and scenarios in `onApplicationBootstrap`. It
guards with "already exists" checks, which is the same check-then-act pattern as A2 — concurrent
replica boots can both pass the check. **Fix:** unique keys on seeded entities + upsert, or an advisory
lock.

#### A4 — Retried jobs re-run the whole conversation

`defaultJobOptions.attempts: 3` with exponential backoff, and the processor sets `status: running` with
no guard for an already-completed execution. `stepResults` is `$set` from a fresh array, so a retry at
least does not duplicate the transcript — but a transient failure late in the job re-drives every LLM
turn and overwrites a previously good result. **Fix:** make the job idempotent — short-circuit if the
execution already has results, or make retries resume rather than restart.

#### A5 — DRY: two implementations of "call an LLM"

`judge-llm.ts` hand-rolls `fetch` plus provider branching, entirely separate from the adapters the
persona path uses. Both now carry their own baseUrl handling, so a fix applied to one will not reach
the other. Consolidating the judge onto the adapters (once A1 makes them stateless) removes the fork.

#### A6 — A service reaches around its own abstraction into Mongo

`scenario-execution.service.ts:509` does
`this.executionModel.db.collection('settings').findOne({})` — bypassing `SettingsService` entirely,
duplicating resolution logic that now lives in `getApiKey()` / `getSimulationBaseUrl()`, and making the
judge path untestable without a live database. The line was extended rather than fixed when
`simulationBaseUrl` was added. Correct it before it grows a third reader.

#### A7 — 17 source files over 500 LOC

| File | LOC | Note |
|---|---|---|
| `server/scripts/seed/insurance-seed.ts` | 1315 | data, not logic — lowest priority |
| `dashboard/.../playground/page.tsx` | 1097 | one component doing config, run, and display |
| `cli/src/commands/scenarios.ts` | 859 | |
| `scorecards-core/scorecards.service.ts` | 799 | CRUD for four entities in one service |
| `sdk/src/types.ts` | 785 | single barrel of every type |
| `scenarios-core/.../scenario.service.ts` | 776 | |
| `scenarios-core/execution-processor.ts` | 695 | **the architectural one** — conversation loop + scoring + persistence + config resolution in one class |
| `dashboard/.../executions/[id]/page.tsx` | 666 | |

`execution-processor.ts` is the one worth splitting on its seams rather than by line count: the
conversation loop, the scoring hand-off, and persistence are three separable jobs.

**Suggested order:** A2 and A3 are small, self-contained, and are correctness bugs today under replica
boots. A1 is the real blocker and unlocks A5. A6 is a ten-line fix. A4 needs a decision on retry
semantics. A7 follows A1 naturally, since making adapters stateless already carves up the processor.

### Testability and multi-node

#### B1 — A green test conceals the cold-start gap

`bootstrap.spec.ts:69` is named **"should seed all defaults on fresh DB"** and it passes. Prompts are
never seeded, so a fresh install cannot execute a scenario (`promptId must be a string`, 400).

The test cannot catch that, because it asserts on **mock calls** rather than resulting state:
`expect(mockPersonaService.createDefaultPersonas).toHaveBeenCalled()`,
`expect(mockScenarioService.createDefaultScenarios).toHaveBeenCalled()`. A seeder that is never invoked
has no mock to fail. The test encodes an incomplete definition of "all defaults" and then guards that
definition. An assertion written against a mock of the thing you control can only prove you called what
you already decided to call.

**Fix:** assert on state, not on calls — after bootstrap, query the DB and assert every collection a
first run needs is non-empty (including `prompts`).

#### B2 — `ScenarioExecutionService` (689 LOC) has zero test references

Nothing imports it in any spec. It holds the judge key/baseUrl resolution, the direct
`db.collection('settings')` access from A6, and the scorecard evaluation entry point — the path that
decides whether a run gets scored at all. It is the most consequential untested file in the repo.

#### B3 — `LabelsService` (248 LOC) has zero test references

The pure agreement maths has 29 tests; the service that writes the labels has none. Untested:
per-reviewer upsert uniqueness, the `agreed` derivation (including the within-1-point rule for scores),
and **the judge-verdict snapshot** — the mechanism that keeps agreement history from rewriting itself
when a run is re-evaluated.

The snapshot is the piece whose silent failure corrupts data permanently, while a wrong kappa is at
least visible. Fix before more labels accumulate under untested write semantics.

#### B4 — `SettingsService` is only ever mocked, never exercised

Its single spec reference (`generation.spec.ts`) injects a mock. The A2 check-then-create race and the
masked-value rejection guard both ship with no test.

#### B5 — Multi-node surface is narrower than assumed

No SSE, no websockets, no in-memory session or request state anywhere in the server. Every `Map` found
is either request-scoped or a stateless registry (`CriteriaHandlerRegistry`, `PersonaStrategyRegistry`
hold stateless singletons and are safe to share).

The multi-node blockers are therefore exactly three, all already recorded: **A1** (stateful adapters),
**A2** (settings race), **A3** (bootstrap seed race). Nothing else in the request path is node-local.

B1 and B4 are the same defect at different sites: tests that assert against mocked collaborators rather
than observable state. That shape cannot catch an omission, which is exactly the failure mode behind
finding ①. The highest-value test work here is converting existing mock-assertions into
state-assertions, not adding coverage.

### Durability under process death

#### C2 — A killed worker orphans the run and loses every turn

An error **thrown inside the job** is handled correctly: `execution-processor.ts:427` catches it, marks
the execution `failed`, and records the message.

The gap is **process death**: SIGKILL, OOM, container restart, rolling deploy. Then:

- **All progress is lost.** The conversation loop (`:227-380`) pushes turns into a local array and the
  only write is at `:381`, *after* the loop. A run killed at turn 9 of 10 persists nothing.
- **The row is orphaned forever.** `status: 'running'` is set at `:81` and never reconciled. There is
  no reaper for stuck executions anywhere in the codebase.
- **`@OnQueueFailed` (`:688`) only logs.** It does not touch the execution document, so it cannot
  rescue the row even when it does fire.
- **The retry pays twice.** Bull redelivers the stalled job and, per A4, it restarts from turn 0 —
  spending 19 turns of LLM to deliver 10.

No `lockDuration`, `maxStalledCount`, or `@OnQueueStalled` handler is configured, so stall detection
runs on Bull defaults that nobody chose. Rolling deploys kill workers as a matter of routine, so this
failure mode occurs on every deploy during an active run.

**Fix:** persist the transcript incrementally (append per turn, or checkpoint every N turns) so a retry
can resume; reconcile the execution row on `@OnQueueFailed`; and add a reaper that fails executions
left `running` past a deadline. The incremental write is what makes A4's "resume rather than restart"
option available at all.

#### C3 — Unique index added to a previously unconstrained field, with no migration

`prompts.name` had no constraint until the default-prompt seeding fix.
`PromptSchema.index({ name: 1 }, { unique: true })` is what makes the seeding upsert genuinely
idempotent. On an existing install that already holds two prompts with the same name (which was legal),
the index build fails. Mongoose logs and continues by default, so the index silently does not exist and
the upsert quietly loses its concurrency guarantee. Nothing surfaces.

The local dev DB happens to have zero duplicates, so this passed by luck, not by design.

**Fix:** a startup check that logs loudly if the index is missing, or a migration that de-duplicates
before building. At minimum, do not let a silent index-build failure masquerade as a working guarantee.

#### C4 — Two ways to create the same entities, one skipping every invariant

`scripts/seed/index.ts` writes raw into eight collections (`prompts`, `personas`, `scorecards`,
`scorecard_categories`, `scorecard_criteria`, `scenarios`, `tool_fixtures`, `settings`) via
`db.collection(...).insertOne`, bypassing the services entirely — so schema defaults, validators and
the virtual-id plugin never run.

The default-prompt seeding fix widened the gap: bootstrap now upserts the shared `DEFAULT_PROMPTS` and
tags them `_default`, while the manual script inserts the same data raw without that tag. The same
named prompt is now a different document depending on which seeder created it.

**Fix:** have the script call the services (it already imports from the workspace), or narrow it to a
thin wrapper over `createDefault*IfNeeded`.

#### C5 — Ruled out

- **Package graph is a clean DAG.** `scorecards-core` is a leaf; `scenarios-core` → scorecards-core;
  `server` → both; `sdk` standalone; `cli`/`dashboard` → sdk. No cycles, correct direction.
- **Config sprawl is mild.** 14 runtime env vars; exactly one (`CHANL_EVAL_SERVER`, a client-side var)
  is absent from `.env.example`.

## API contract and client boundary

### D1 — No response envelope, and a client that guesses

The API has no standardised response shape. There is no global interceptor, and each controller
returns an ad-hoc object: `{ session }`, `{ execution }`, `{ scenarios, total }`,
`{ provider, apiKey }`, and in places a bare value.

`unwrapResponse` (`sdk/src/client.ts:33`) unwraps a `{ success, data }` envelope. **No endpoint emits
that shape** — a grep for `success: true` across all three server packages returns nothing. The
primary branch of the client's unwrapping logic guards a contract that does not exist.

Downstream, every SDK module compensates by guessing. 43 shape fallbacks across 8 modules:

| Module | Fallbacks | Module | Fallbacks |
|---|---|---|---|
| `scorecards.ts` | 15 | `prompts.ts` | 4 |
| `scenarios.ts` | 7 | `tool-fixtures.ts` | 4 |
| `personas.ts` | 6 | `executions.ts` | 3 |
| `labels.ts` | 2 | `settings.ts` | 2 |

The `|| data` idiom is the dangerous part:

```ts
return data.execution || data;
```

If the server renames `execution` to `run`, this does not throw. It silently returns the whole
envelope — an object that is not an `Execution` but is truthy — and the failure surfaces somewhere
far from its cause. The fallback converts a loud, local contract break into a quiet, remote one.

The cost is already visible outside the SDK: ad-hoc consumers must probe two or three shapes
(`d.scenarios ?? d.data.scenarios`) to read a list, because the shape is not predictable from the
endpoint.

**Fix:** one global response interceptor emitting a single envelope, and delete the fallbacks so a
contract break fails at the boundary that broke it. Removing `|| data` without standardising first
would only move the breakage, so the interceptor comes first.

### D2 — Client-side aggregation is effectively absent (recorded, no action)

One `find()` inside `datasets/page.tsx:418`, over data already in hand — a lookup, not a join. No
page fetches two collections to stitch them in the browser. This class of problem does not exist
here and does not need re-auditing.

### D3 — File size unchanged at 17 over 500 LOC

No regression, no improvement. Tracked as A7.

## File size is regressing, and the metric hid it

### E1 — Every fix landed in a file that was already over budget

Six files above the 500-line limit grew by a net **+254 lines** during the fixes recorded above. None
shrank.

| File | Before | After | Δ |
|---|---:|---:|---:|
| `sdk/src/types.ts` | 666 | 785 | +119 |
| `scorecards-core/scorecards.service.ts` | 799 | 865 | +66 |
| `scenarios-core/scenario-execution.service.ts` | 676 | 701 | +25 |
| `scenarios-core/scenario.service.ts` | 776 | 799 | +23 |
| `dashboard/executions/[id]/page.tsx` | 646 | 666 | +20 |
| `scenarios-core/execution-processor.ts` | 694 | 695 | +1 |

New files created in the same period are all well inside the limit — largest is 331 lines. So the
discipline holds for new code and fails completely for existing code: every correctness fix was
appended to the nearest large service rather than prompting a split.

### E2 — "17 files over 500 LOC" is the wrong measurement

That count was reported as unchanged and therefore "no regression". It cannot detect this: a file
moving from 799 to 865 does not change the count. The metric is insensitive to severity and reports
stability while the problem compounds.

**Use total excess instead** — the sum of `max(0, loc - 500)` across the repo. It moves whenever any
oversized file grows, so appending to a large file registers immediately rather than being absorbed.

### E3 — Scorecard tree construction is not atomic with its insert

Surfaced while making seeding idempotent, and pre-existing. `createDefaultScorecardIfNeeded` inserts
the scorecard, then builds 5 categories and 11 criteria in follow-up writes. A racing replica can
receive the scorecard id before that tree exists, and a crash between the two steps leaves an empty
scorecard permanently, since nothing re-checks. A complete fix needs unique indexes on
`scorecard_categories` and `scorecard_criteria` so the tree build is itself idempotent.

## Review log

| Date | Verdict | Notes |
|------|---------|-------|
| 2026-07-24 | 4/4 findings verified | ① traced to three broken links (dashboard localStorage-only, docker-compose no env passthrough, README no key step) against an intended server-Settings design already implemented in server + SDK. ④ confirmed by the judge system prompt encoding placeholder strictness that belongs in code. Roadmap re-ordered: onboarding, cost, determinism, and trust ahead of voice. |
