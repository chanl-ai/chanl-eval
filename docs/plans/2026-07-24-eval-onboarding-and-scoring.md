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

## Review log

| Date | Verdict | Notes |
|------|---------|-------|
| 2026-07-24 | FINDINGS VERIFIED — 4/4 real, ① worse than reported | Intern's Docker first-run report. ① traced to three broken links (dashboard localStorage-only, docker-compose no env, README no key step) against an intended server-Settings design already implemented in server + SDK. ④ confirmed by the judge system prompt hand-patching placeholder strictness that belongs in code. Roadmap re-ordered: onboarding/cost/determinism/trust ahead of voice. |
