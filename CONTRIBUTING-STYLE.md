# Writing style for code, comments and docs

chanl-eval is public. Everything in the repo is read by people evaluating whether to trust the
tool. Prose that reads as a session transcript, or that narrates how the code came to be, costs
credibility and tells the reader nothing they can act on.

## The test

Every comment and doc paragraph should survive this question:

> Does a stranger reading this six months from now do something differently because of it?

If not, delete it.

## Comments

**Write the constraint, not the story.**

```ts
// Recompiled per evaluation: shared /g regexes carry mutable lastIndex, so a reused
// instance makes matching depend on what ran before it.
```

```ts
// BAD — narrates history and deliberation
// I originally used the shared instance here, but that turned out to be buggy because
// the lastIndex was being carried over from the previous run, which I discovered when
// the second evaluation returned different results. So now we recompile.
```

Rules:

- State the technical reason a thing is the way it is. One or two sentences.
- No history. "Previously", "used to be", "the bug this fixes", "this was broken before" — the
  reason belongs in the comment; the chronology belongs in git.
- No self-reference. No "I", "we found", "my", "note that I".
- No apology, no editorialising, no "obviously", "simply", "just".
- Match the density of the file you are in. A file with sparse comments does not want an essay.
- Comment the non-obvious: an ordering requirement, a constraint from an external system, a
  deliberate deviation from the surrounding pattern, why the obvious approach fails. Never restate
  the line below.

## Commit messages

- Subject: imperative, specific, under ~72 chars.
- Body: what was wrong, why it mattered, what changed. Include real evidence (numbers, output).
- No narration of the debugging process. No "I then realised".
- Length should match the change. A one-line fix does not need six paragraphs.

## Docs

- Lead with the fact. No rhetorical build-up, no "the headline finding is".
- Tables for anything enumerable. Prose only for reasoning.
- Sentence case headings.
- No first person. No references to who asked for the work or how it was discovered, unless that
  is itself load-bearing (a reproduction case is; an anecdote is not).
- Findings stand on technical merit alone. Attribution belongs in git history, not in the doc.
- State status plainly where something can go stale: current / superseded / historical.

## Denoising an existing file

Work in this order:

1. Delete anything that fails the test above.
2. Collapse repeated statements of the same point into one.
3. Replace narrative with the constraint it was circling.
4. Cut connective padding ("it is worth noting that", "as mentioned above").
5. Re-read start to finish and confirm no technical fact was lost. Cutting prose must not cut
   information — if a fix, file reference, root cause or reproduction disappears, the edit is wrong.

## What not to strip

Terseness is not the goal; signal density is. Keep:

- Root causes, reproductions, file:line references, verification evidence.
- Non-obvious constraints and the reasoning behind a design decision.
- Warnings about failure modes that are expensive to rediscover.
