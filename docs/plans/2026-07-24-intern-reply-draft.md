# Draft reply to intern — 2026-07-24

> Draft only. Edit freely before sending.

---

Subject: Re: chanl-eval first run — all four were real

Thanks for this. Genuinely one of the most useful pieces of feedback we've had on chanl-eval, partly
because you ran it cold from the quickstart, which nobody on the inside can do anymore. All four
things you flagged were real. Three are now fixed and the fourth is built. Rundown:

**1. API keys never reaching the engine. Not you, and worse than you described.**

You found the single biggest adoption blocker in the repo. There were three broken links in one chain:

- The intended design is that keys live on the server. `execute-scenario.ts` literally says "API keys
  come from server-side Settings, never sent from the client", and the server implements it
  (`PUT /settings`) and the SDK exposes it.
- The dashboard never called it. The Settings page wrote those fields to `localStorage` and nothing
  else. Three write-only inputs. A key typed there could not reach a run by any route.
- `docker-compose.yml` passed no `CHANL_OPENAI_API_KEY` to the server, and the README quickstart had
  no key step at all.

So `PUT /settings` by hand was the only path in. That's not a step you missed, it's the only door
that existed.

Fixed: the Settings page now reads and writes the server settings, docker-compose passes the env vars
through (plus a `.env.example`), the README documents both routes, and the dashboard shows a
"No LLM key configured" banner when the engine genuinely can't reach a model. Two latent bugs turned
up while wiring it, both of which would have bitten you next: saving one provider's key silently
deleted the other's, and echoing back the masked `••••abcd` value would have overwritten the real key
with bullets.

**2. Persona and judge pinned to OpenAI/Anthropic. Correct.**

Exactly as you diagnosed. The agent under test honours a custom endpoint; the simulation half didn't.
`persona-llm.ts` built adapters without passing the endpoint through, and `judge-llm.ts` bypassed the
adapters entirely to `fetch` the public host. There wasn't even a field on the config object to put a
host in.

Now there is: set a simulation base URL in Settings (or `CHANL_SIMULATION_BASE_URL`) and both the
persona and the judge run against any OpenAI-compatible endpoint. Base URL or full endpoint both
work. Verified by pointing the judge at a local stub and watching every verdict come back from it.

You were right about why this matters, too: simulation is the high-volume half of a run, so it's the
half where a cheap local model actually changes what a suite costs.

**3. Judge reliability. On the radar, and you shook out a live bug.**

`selfConsistency: k` on a prompt criterion now draws k samples, votes (majority for boolean, median
for score), and reports inter-sample agreement as a confidence value. A single sample gives you a
verdict with no way to tell a confident judge from one flipping a coin.

The bug: when the judge returned malformed JSON, the parser quietly substituted `result: 5,
passed: false`. So a transport failure was indistinguishable from the judge deciding your agent was
mediocre, and it counted against the score. Judge failures are now explicit, retried once, and
reported as N/A. Which exposed a second one: N/A criteria were being averaged into category scores as
zeros, so any criterion we couldn't evaluate was silently penalising the agent.

Judge-vs-human agreement (storing human labels, reporting Cohen's kappa) is the next step and is on
the roadmap, not in this batch. It's the piece I think differentiates us most: nobody in this space
publishes their judge's agreement rate.

**4. Code checks before LLM checks. Right, and the codebase already agreed with you.**

The best evidence you were right is in `judge-llm.ts`. Its system prompt contains a hand-written
instruction: "Be STRICT about template placeholders, if the agent outputs '[insert X here]' ... that
is a FAILURE." Somebody had already noticed this failure mode and patched it into an LLM prompt
because there was no code path for it. `KeywordHandler` is literal substring matching only, so it
couldn't do the job.

There's now a `pattern` criterion type: regexes plus a built-in library covering placeholders, system
prompt leakage, PII, and internal identifiers. It scans the agent's turns only, since the persona is
supposed to be able to say anything. On a rerun of a template-leaking agent it fails with
`placeholder.currency_x, placeholder.bracket_instruction, placeholder.template_var (10 occurrences)`
and quotes the matched spans, for zero LLM calls.

Your framing is the one I'd keep: cheap deterministic checks first, save the model for what actually
needs judgement.

---

If you want to keep going, the two I'd most like help with are the judge-agreement work from (3), and
extending the pattern library. Both are self-contained and neither needs much context on the rest of
the system.

Thanks again. This was a good catch list.
