# chanl-eval Demo Script — "pytest for AI agents"

**Audience:** LinkedIn — developers, PMs, AI builders who've never seen chanl-eval
**Duration:** ~2.5 minutes
**Tone:** Show, don't explain. Let the product speak.
**Format:** Screen recording with voiceover (live run optional — see Scene 3 notes)

---

## Scene 1: The Problem (0:00–0:10)

**Screen:** Black screen or simple text slide

> "You built an AI agent. It works in your demo. But what happens when a customer is furious? When someone tries to jailbreak it? When it starts making things up?"

> "You need a way to test that — automatically, repeatably, before it hits production."

---

## Scene 2: The Playground — Set Up a Test (0:10–0:35)

**Screen:** `/playground` — Config tab visible

**Action:** Show the Playground. Scenario dropdown already set to **[G1] Smooth Support**, Persona set to **Calm James**.

> "This is chanl-eval. Open source. You define a scenario — the customer's situation — and a persona — who the customer is. Then you point it at your agent."

**Action:** Show the system prompt in the editor (Customer Support Agent). Point out model selector (OpenAI, gpt-4o-mini), tools checkboxes on the right.

> "Your agent gets a system prompt, a model, and tools — just like production. The persona gets a personality, a backstory, and a reason for calling."

---

## Scene 3: Run It — Good Agent (0:35–1:15)

**Action:** Click **Run Test**. Switch to **Chat** tab.

**Option A — Live:** Let the conversation stream in real-time. 4-6 turns, ~30 seconds. The persona asks about their standing desk order, agent looks it up with `check_order_status` tool, gives a clear update.

**Option B — Pre-recorded:** Show a completed conversation. Scroll through it naturally.

> "The persona opens the conversation naturally — 'Hey, I ordered a standing desk about a week ago, order number ORD-789.' The agent uses its tools, looks up the order, gives an accurate status update."

**Action:** Conversation completes. Pause to let the viewer read 2-3 exchanges.

> "That's an AI customer testing your AI agent. Fully automated."

---

## Scene 4: Run It — Bad Agent (1:15–1:55)

**Action:** Switch scenario to **[B1] Hallucination Stress Test**, persona to **Angry Karen**. Switch prompt to **Weak Support Agent**. Hit **Run Test**.

> "Same framework. But now the customer is furious — charged twice, called before, wants answers. And this agent? Deliberately underspecified. Watch what happens."

**Action:** Conversation streams. Agent fabricates details — makes up refund timelines, invents an "expedited refund option" that doesn't exist.

> "The agent just told Karen there's an expedited refund option. There isn't one. That's a hallucination — and the scorecard catches it."

**Action:** Navigate to `/executions`, click the latest run. Show the scorecard results — red scores on Hallucination Detection, with evidence quotes.

> "Hallucination Detection: fail. Here's exactly what the agent fabricated, and the ground truth it contradicted. This isn't a vibe check — it's evidence."

---

## Scene 5: How It's Built (1:55–2:20)

Quick tour — 5 seconds each, no deep dives:

**Action:** Click `/scenarios` — show the grid of 13 cards.

> "Scenarios define the test — the customer's situation, written in first person."

**Action:** Click `/personas` — show the grid of 10 cards with trait badges.

> "Personas define who the customer is — their patience, communication style, cooperation level."

**Action:** Click `/scorecards` — show Call Quality Scorecard with 6 categories.

> "Scorecards define how you grade — hallucination detection, tool use verification, conversation completeness, role adherence. Nine evaluator types, all configurable."

---

## Scene 6: The CLI (2:20–2:30)

**Screen:** Terminal (split screen or cut to terminal)

```
$ chanl run smooth-support --persona calm-james
```

> "Or skip the dashboard entirely. One command from your terminal or CI pipeline."

**Action:** Show the CLI output — colored transcript + scorecard results in the terminal.

---

## Scene 7: Close (2:30–2:45)

**Screen:** Back to dashboard or GitHub repo page

> "chanl-eval. Open source. pytest for AI agents. Define scenarios, simulate customers, catch failures before your users do."

> "Star the repo. Link in comments."

**Action:** Show GitHub star count / repo URL briefly.

---

## Pre-Recording Checklist

- [ ] API key configured in Settings (OpenAI — gpt-4o-mini for speed)
- [ ] Dry-run [G1] Smooth Support + Calm James — confirm it completes in <30s, agent uses tools
- [ ] Dry-run [B1] Hallucination Stress Test + Angry Karen with Weak Support Agent — confirm the agent hallucinates (it should with the vague prompt)
- [ ] Execution results page loads with scorecard — verify red/green scores render
- [ ] CLI installed and configured: `chanl config set-key <key>`
- [ ] Terminal font size bumped for readability
- [ ] Browser zoom at 100%, sidebar open, dark/light mode consistent throughout

## If Going Live

- gpt-4o-mini is the safest choice — fast responses (~2-5s per turn), cheap ($0.001/run)
- Conversations are 4-6 turns, ~30-45 seconds total
- If it stalls: narrate what you're seeing, the audience won't know the expected pace
- Have the second scenario pre-selected in another tab so you can switch instantly
- Do 3 dry runs before recording — the third one is your baseline for "normal"

## Key Lines to Hit (for editing)

These are the sound bites that work in short-form clips:

- "An AI customer testing your AI agent. Fully automated."
- "The agent just made that up. The scorecard caught it."
- "This isn't a vibe check — it's evidence."
- "pytest for AI agents."
- "Catch failures before your users do."
