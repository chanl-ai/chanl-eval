# Scorecard Evaluation System

Scorecards are the scoring engine of chanl-eval. They define what to measure in a conversation and how to calculate an overall quality score.

## Data Model

Scorecards use a three-level hierarchy stored across three MongoDB collections:

```
Scorecard                          (scorecards collection)
├── name, description, status
├── scoringAlgorithm               "weighted_average" | "simple_average" | "minimum_all" | "pass_fail"
├── passingThreshold               0-100 (default: 70)
│
├── Category: "Opening & Greeting"  (scorecard_categories collection)
│   ├── weight: 15
│   ├── Criteria: "Proper Greeting"  (scorecard_criteria collection)
│   │   ├── type: "prompt"
│   │   ├── settings: { description: "...", evaluationType: "boolean" }
│   │   └── threshold: { expectedValue: true }
│   └── Criteria: "Greeting Keywords"
│       ├── type: "keyword"
│       ├── settings: { matchType: "must_contain", keyword: ["hello", "hi", ...] }
│       └── threshold: (none -- keyword match is binary)
│
├── Category: "Problem Resolution"
│   ├── weight: 35
│   └── ...
│
└── Category: "Timing Metrics"
    ├── weight: 15
    └── ...
```

**Scorecard** -- Top-level container. Has a `scoringAlgorithm` and `passingThreshold`.

**Category** -- Groups related criteria. Has a `weight` (used in weighted_average scoring) and an `order` for display.

**Criteria** -- Individual evaluation checks. Each has a `type` (determines which handler runs), `settings` (type-specific configuration), and an optional `threshold` (determines pass/fail).

Source: `packages/scorecards-core/src/schemas/`

## Criteria Types

Seven built-in criteria types, each handled by a dedicated `CriteriaHandler`:

| Type | Handler | What It Evaluates | Settings |
|------|---------|-------------------|----------|
| `prompt` | PromptHandler | LLM-as-judge evaluation of transcript | `description`, `evaluationType` ("boolean" or "score") |
| `keyword` | KeywordHandler | Presence/absence of keywords in transcript | `matchType` ("must_contain" or "must_not_contain"), `keyword` (string or array), `caseSensitive` |
| `response_time` | ResponseTimeHandler | Agent response latency in seconds | `participant` ("agent", "customer", or "both") |
| `talk_time` | TalkTimeHandler | Talk duration or talk ratio | `participant` ("agent", "customer", "both", "agent_ratio", "customer_ratio") |
| `silence_duration` | SilenceDurationHandler | Total silence in the conversation | (none) |
| `interruptions` | InterruptionsHandler | Number of interruptions | `participant` ("agent", "customer", or "both") |
| `tool_call` | ToolCallHandler | Whether expected tools were invoked | `expectedTool` (string or array), `executionCondition` |

Source: `packages/scorecards-core/src/handlers/`

## Threshold Types

Each criterion can have a threshold that determines pass/fail:

```typescript
// Boolean -- did it happen or not?
{ expectedValue: true }
{ expectedValue: false }

// Numerical -- is the value within range?
{ min: 7, max: 10 }     // score must be 7-10
{ max: 5 }              // response time must be <= 5s
{ min: 3 }              // at least 3 occurrences

// Percentage -- is the ratio within range?
{ minPercentage: 30, maxPercentage: 70 }  // agent talk ratio 30-70%
```

The `checkThreshold()` function in `scoring-utils.ts` evaluates results against thresholds. If no threshold is set, the criterion always passes.

## CriteriaHandler Interface

Every criteria type implements this interface:

```typescript
// packages/scorecards-core/src/handlers/criteria-handler.interface.ts

interface CriteriaHandler {
  readonly type: string;  // matches CriteriaType enum value

  evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult>;
}

interface CriteriaHandlerResult {
  result: any;          // raw value (boolean, number, etc.)
  passed: boolean;      // did it meet the threshold?
  reasoning: string;    // human-readable explanation
  evidence: string[];   // supporting excerpts from transcript
}
```

Handlers receive an `EvaluationContext` with:
- `transcriptText` -- full transcript as a single string
- `segments` -- individual speaker turns with timestamps
- `metrics` -- pre-computed metrics (talk time, silence, interruptions, response latency)
- `toolCalls` -- tools invoked during the conversation
- `llmEvaluate` -- optional function for LLM-as-judge evaluations (used by `prompt` type)

## CriteriaHandlerRegistry

Handlers are registered at startup and looked up by type at evaluation time:

```typescript
// packages/scorecards-core/src/handlers/criteria-handler-registry.ts

const registry = new CriteriaHandlerRegistry();
registry.register(new KeywordHandler());
registry.register(new PromptHandler());
registry.register(new ResponseTimeHandler());
// ...

// At evaluation time:
const handler = registry.getOrThrow('keyword');
const result = await handler.evaluate(criteria, context);
```

See [criteria-types.md](./criteria-types.md) for how to build and register custom criteria handlers.

## Scoring Algorithms

The scorecard's `scoringAlgorithm` determines how category scores roll up into an overall score:

### weighted_average (default)

Each category's score is multiplied by its weight, summed, and divided by total weight.

```
Overall = sum(categoryScore * categoryWeight) / sum(categoryWeight)
```

Example with three categories (weights 35, 25, 15):
```
Problem Resolution:  8.5 * 35 = 297.5
Communication:       7.0 * 25 = 175.0
Timing:              9.0 * 15 = 135.0
                                ------
Total weight: 75     Overall = 607.5 / 75 = 8.1
```

### simple_average

Arithmetic mean of all category scores, ignoring weights.

```
Overall = sum(categoryScores) / count(categories)
```

### minimum_all

Binary: 10 if every single criterion passed, 0 if any failed. Use this for compliance-style scorecards where every check must pass.

### pass_fail

Same calculation as `simple_average`, but the name signals intent: the overall score is compared against `passingThreshold` to produce a binary pass/fail result.

## Score Normalization

All criteria results are normalized to a 0-10 scale before category averaging. The `normalizeScore()` function handles this:

| Evaluation Type | Normalization |
|----------------|---------------|
| `boolean` | `passed ? 10 : 0` |
| `score` | Clamped to 0-10 range (already on that scale) |
| `percentage` | Divided by 10 (0-100% maps to 0-10) |
| `number` | Compared against threshold bounds; 10 if within range, degraded outside |

Source: `packages/scorecards-core/src/handlers/scoring-utils.ts`

## EvaluationService Orchestration

The `EvaluationService` runs the full evaluation pipeline:

```
evaluate(scorecardId, context, options)
│
├── 1. Load scorecard from MongoDB
├── 2. Load all categories (sorted by order)
├── 3. Load all active criteria for the scorecard
├── 4. Create ScorecardResult record (status: "processing")
│
├── 5. For each criterion:
│   ├── Look up handler from CriteriaHandlerRegistry
│   ├── Call handler.evaluate(criterion, context)
│   └── Collect CriteriaResult (result, passed, reasoning, evidence)
│
├── 6. Calculate category scores
│   └── For each category: average of normalizeScore() for its criteria
│
├── 7. Calculate overall score using scoring algorithm
├── 8. Determine passed = overallScore >= (passingThreshold / 100) * 10
│
└── 9. Update ScorecardResult (status: "completed", scores, results, metadata)
```

The result is persisted to the `scorecard_results` collection and returned as an `EvaluationResult`:

```typescript
interface EvaluationResult {
  resultId: string;
  scorecardId: string;
  overallScore: number;              // 0-10 scale
  categoryScores: Record<string, number>;  // category name -> 0-10
  criteriaResults: CriteriaResult[];
  status: string;                    // "completed" or "failed"
  passed: boolean;
}
```

Source: `packages/scorecards-core/src/evaluation/evaluation.service.ts`

## Default Scorecard

If no scorecard exists, the system can auto-create a "Call Quality Scorecard" with five categories:

| Category | Weight | Criteria Count |
|----------|--------|---------------|
| Opening & Greeting | 15 | 2 (prompt + keyword) |
| Problem Resolution | 35 | 3 (prompt x3) |
| Communication Quality | 25 | 3 (prompt x2 + keyword) |
| Closing & Follow-up | 10 | 2 (prompt + keyword) |
| Timing Metrics | 15 | 3 (response_time + talk_time + silence_duration) |

This provides a reasonable starting point. Create custom scorecards for your specific evaluation needs.
