[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

# chanl-eval

Open-source testing engine for AI agents. Simulate multi-turn conversations with configurable personas, evaluate responses with scorecards, and catch regressions before they reach production.

## Table of Contents

- [Quick Start](#quick-start)
- [Why chanl-eval](#why-chanl-eval)
- [Use Cases](#use-cases)
- [Features](#features)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Development Setup](#development-setup)
- [Customization](#customization)
- [How chanl-eval Compares](#how-chanl-eval-compares)
- [Roadmap](#roadmap)
- [Chanl Cloud](#chanl-cloud)
- [Contributing](#contributing)

---

## Quick Start

```bash
git clone https://github.com/chanl-ai/chanl-eval.git
cd chanl-eval
docker compose up
```

Open **[http://localhost:3010](http://localhost:3010)**. Sample scenarios, personas, and a scorecard are seeded on first run.

> Docker builds everything (MongoDB, Redis, API server, dashboard). First build takes a few minutes. For development with hot reload, see [Development Setup](#development-setup).

---

## Why chanl-eval

We build tools for shipping customer-facing AI agents at [Chanl](https://chanl.ai).

Existing eval tools score individual prompts. We needed something that drives full conversations against our agent with different customer personalities, scores each interaction against a rubric, and runs the same tests after every change.

chanl-eval is that tool.

---

## Use Cases

**Regression testing** — Run the same scenario after every prompt or model change. Catch score drops before deploying.

**Persona stress testing** — Test how your agent handles a hostile caller, a confused elderly customer, or an impatient executive. Same scenario, different personality.

**Tool call verification** — Mock your agent's tools (refund processing, order lookup, knowledge search) and verify it calls the right tool with the right arguments.

**Scorecard evaluation** — Grade conversations on empathy, de-escalation, protocol compliance, keyword usage, and response time. Per-criteria pass/fail with reasoning.

**Model comparison** — Run the same scenarios against GPT-4o vs Claude vs your fine-tune. Compare scorecard results side by side.

**Manual testing** — Chat with your agent through the playground. Save prompts, adjust parameters, review transcripts.

---

## Features

| Feature | Description |
|---------|-------------|
| **Persona simulation** | Configurable traits: emotion, cooperation, patience, speech style, intent clarity. Each combination produces meaningfully different conversation behavior. |
| **Scorecard evaluation** | Criteria grouped by category. Types: keyword matching, LLM judge, response time, tool call verification. Per-criteria pass/fail with reasoning and evidence. |
| **Tool fixture mocking** | Define mock tools with configurable responses. Verify tool call arguments and result handling without connecting to real APIs. |
| **Playground** | Manual chat with your agent. Save system prompts, select scenarios and personas, adjust model parameters. |
| **Transcript + results** | Full conversation with search. Expandable scorecard criteria showing reasoning and transcript evidence. |
| **Multi-provider** | OpenAI, Anthropic, or any OpenAI-compatible endpoint (Ollama, Together, vLLM, Azure). Separate config for agent vs simulation LLM. |
| **Custom attributes** | Key-value pairs on personas (product name, order ID, account number) injected into simulation prompts. |

---

## How It Works

| Step | What happens | Example |
|------|-------------|---------|
| **1. Define** | Create a scenario (situation), persona (personality traits), and scorecard (evaluation criteria) | Scenario: "Angry refund request" / Persona: hostile, low patience / Scorecard: empathy, greeting, tool calls |
| **2. Simulate** | Persona engine builds a behavioral prompt from traits. Conversation runs turn-by-turn against your agent via OpenAI, Anthropic, or custom HTTP | Persona: "I want a refund NOW" / Agent: "Let me check your order..." (10 turns) |
| **3. Evaluate** | Scorecard evaluates the completed transcript. Each criterion gets pass/fail with reasoning and evidence | ✓ Empathy demonstrated / ✗ No greeting / ✓ Offered resolution / ✗ Didn't verify order / Overall: 60% |

---

## Configuration

### Settings Page

Three sections:

- **Eval Server** — API connection (defaults to localhost)
- **Agent Under Test** — the LLM being evaluated (provider, model, API key, base URL)
- **Simulation LLM** — powers persona generation and scorecard judge (can be a different, cheaper model)

All credentials stay in the browser. Never stored on the server.

### Persona Traits

| Trait | Range | Effect |
|-------|-------|--------|
| Emotion | friendly → hostile | Tone and escalation behavior |
| Cooperation | very cooperative → hostile | Accepts solutions vs demands manager |
| Patience | high → very impatient | Reactions to delays and scripts |
| Speech Style | slow → fast | Response length |
| Intent Clarity | very clear → mumbled | How directly needs are stated |
| Custom Attributes | key-value pairs | Injected into prompt context |

### Scenario Configuration

Each scenario links to a persona and an optional scorecard. The scenario's situation prompt defines what the customer is calling about. The persona's traits define how they behave. The scorecard defines how the result is graded.

---

## Development Setup

For active development with hot reload:

```bash
pnpm install
docker compose up -d mongodb redis    # Databases only
pnpm build                            # Build workspace packages
pnpm dev:server                       # http://localhost:18005 (auto-restart)
pnpm dev:dashboard                    # http://localhost:3010 (HMR)
```

| | Docker Quick Start | Development Setup |
|---|---|---|
| Code changes | `docker compose up --build` | Instant hot reload |
| Setup | Docker only | Node.js + pnpm |
| Best for | Trying it out | Active development |

### Project Structure

```
packages/
├── scenarios-core/    # Personas, execution engine, LLM adapters
├── scorecards-core/   # Criteria handlers and evaluation
├── server/            # NestJS API (port 18005)
├── sdk/               # TypeScript client
├── cli/               # CLI tool
└── dashboard/         # Next.js UI (port 3010)
```

---

## Customization

| What | File |
|------|------|
| Persona prompt generation | `scenarios-core/src/simulator/persona-simulator.service.ts` |
| LLM judge prompt | `scenarios-core/src/execution/judge-llm.ts` |
| Scorecard criteria handlers | `scorecards-core/src/handlers/` |
| Agent provider adapters | `scenarios-core/src/adapters/` |

---

## How chanl-eval Compares

Tools like [promptfoo](https://github.com/promptfoo/promptfoo), [DeepEval](https://github.com/confident-ai/deepeval), and [RAGAS](https://github.com/explodinggradients/ragas) evaluate prompts and RAG pipelines. chanl-eval evaluates **conversations** — multi-turn interactions where an AI persona drives the dialogue as a simulated customer.

| Capability | chanl-eval | promptfoo | DeepEval | RAGAS |
|-----------|-----------|-----------|----------|-------|
| Multi-turn conversation simulation | Yes | No | Partial | No |
| Configurable persona personalities | Yes | No | No | No |
| Per-criteria scorecard with evidence | Yes | Partial | Yes | Yes |
| Tool call mocking + verification | Yes | No | Yes | No |
| Dashboard UI | Yes | Yes | Via platform | No |
| RAG metrics (faithfulness, recall) | No | Yes | Yes | Yes |
| Red teaming / security scanning | No | Yes | No | No |
| CI/CD pytest integration | Planned | Yes | Yes | Yes |
| Synthetic test data generation | No | No | Yes | Yes |
| Hallucination detection | Planned | Yes | Yes | Yes |

**Our focus:** If your agent has multi-turn conversations with customers, chanl-eval tests the full interaction — not just individual prompts.

---

## Roadmap

Planned features (contributions welcome):

- [ ] **CI/CD integration** — Run scenarios from GitHub Actions, assert on scorecard pass rates
- [ ] **Batch execution** — Run all scenarios in parallel with one command
- [ ] **A/B model comparison** — Side-by-side results for two models on the same scenario
- [ ] **Hallucination detection** — Flag agent responses not grounded in provided context
- [ ] **RAG evaluation criteria** — Faithfulness, context relevance, answer completeness
- [ ] **Prompt template editor** — Liquid template UI for persona prompt customization
- [ ] **Regression alerts** — Flag score drops compared to previous runs
- [ ] **Export results** — CSV/JSON export of scorecard results for external analysis
- [ ] **Webhook triggers** — Evaluate production conversations via webhook
- [ ] **Python SDK** — Run evaluations from Python test suites

---

## Chanl Cloud

chanl-eval is the open-source version of [Chanl](https://chanl.ai).

Cloud adds: voice agent testing, real-time production monitoring, team workspaces, emotional persona arcs, webhook-triggered evaluation, and regression detection dashboards.

[Upgrade to Chanl Cloud →](https://chanl.ai?ref=eval-readme)

---

## Contributing

```bash
pnpm install
docker compose up -d mongodb redis
pnpm build
pnpm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
