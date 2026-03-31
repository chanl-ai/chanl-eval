# Criteria Handler System

Criteria handlers evaluate individual aspects of a conversation. Each handler implements a specific evaluation strategy -- from simple keyword matching to LLM-as-judge analysis.

## CriteriaHandler Interface

```typescript
// packages/scorecards-core/src/handlers/criteria-handler.interface.ts

interface CriteriaHandler {
  readonly type: string;

  evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult>;
}

interface CriteriaHandlerResult {
  result: any;          // raw evaluation value
  passed: boolean;      // threshold check outcome
  reasoning: string;    // human-readable explanation
  evidence: string[];   // supporting excerpts (max ~3)
}
```

The handler receives the criterion definition (with its `settings` and `threshold`) and an `EvaluationContext` containing transcript data, metrics, tool calls, and an optional LLM evaluator function.

## EvaluationContext

The context provides everything a handler might need:

```typescript
interface EvaluationContext {
  transcriptText: string;     // full transcript joined as text

  segments?: Array<{          // individual speaker turns
    speaker: string;
    text: string;
    startTime?: number;
    endTime?: number;
    duration?: number;
  }>;

  metrics?: {
    duration?: number;                          // total call duration (seconds)
    firstResponseLatency?: number;              // first agent response time
    avgSegmentLength?: Record<string, number>;  // avg segment by speaker
    talkTime?: Record<string, number>;          // total talk time by speaker
    silence?: {
      total?: number;
      max?: number;
      average?: number;
    };
    interruptions?: Record<string, number>;     // count by speaker
  };

  toolCalls?: Array<{         // tools invoked during conversation
    name: string;
    arguments?: Record<string, any>;
    result?: any;
    timestamp?: Date;
    function?: { name: string };
  }>;

  llmEvaluate?: (params: {   // LLM-as-judge function (for prompt type)
    criterionName: string;
    description: string;
    evaluationType: 'boolean' | 'score';
    transcript: string;
    threshold?: { type: 'boolean' | 'numerical'; ... };
  }) => Promise<{
    result: boolean | number;
    passed: boolean;
    reasoning: string;
    evidence: string[];
    confidence?: number;
  }>;
}
```

## Built-in Handlers

### prompt -- LLM-as-Judge

Delegates evaluation to an LLM. The LLM reads the transcript and answers a question defined in the criterion's `description`.

**Settings:**

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | The evaluation question for the LLM |
| `evaluationType` | `"boolean"` or `"score"` | Whether the LLM returns true/false or a 0-10 score |

**Thresholds:**
- Boolean: `{ expectedValue: true }` or `{ expectedValue: false }`
- Score: `{ min: 7, max: 10 }`

**Example criterion:**
```json
{
  "key": "issue_identified",
  "name": "Issue Identified",
  "type": "prompt",
  "settings": {
    "description": "Did the agent correctly identify the customer's issue?",
    "evaluationType": "boolean"
  },
  "threshold": { "expectedValue": true }
}
```

**Fallback behavior:** If no `llmEvaluate` function is available or the transcript is empty, the handler returns a safe fallback (`false` for boolean, `5` for score) with `passed: false`.

Source: `packages/scorecards-core/src/handlers/prompt.handler.ts`

### keyword -- Text Pattern Matching

Checks whether specific keywords appear (or do not appear) in the transcript.

**Settings:**

| Field | Type | Description |
|-------|------|-------------|
| `matchType` | `"must_contain"` or `"must_not_contain"` | Match strategy |
| `keyword` | string or string[] | Keyword(s) to search for |
| `caseSensitive` | boolean | Case-sensitive matching (default: false) |

**Threshold:** None needed; pass/fail is determined by matchType logic.

**Example criteria:**
```json
{
  "key": "greeting_keywords",
  "type": "keyword",
  "settings": {
    "matchType": "must_contain",
    "keyword": ["hello", "hi", "good morning", "how can I help"]
  }
}
```
```json
{
  "key": "no_profanity",
  "type": "keyword",
  "settings": {
    "matchType": "must_not_contain",
    "keyword": ["damn", "hell", "stupid"],
    "caseSensitive": false
  }
}
```

**Evidence:** Up to 3 transcript segments where keywords were found, with speaker attribution.

Source: `packages/scorecards-core/src/handlers/keyword.handler.ts`

### response_time -- Agent Latency

Measures how quickly the agent responds.

**Settings:**

| Field | Type | Description |
|-------|------|-------------|
| `participant` | `"agent"`, `"customer"`, or `"both"` | Whose response time to measure |

**Data sources (priority order):**
1. `metrics.firstResponseLatency` -- preferred
2. `metrics.avgSegmentLength[participant]` -- fallback
3. Calculated from segment timestamps -- last resort

**Threshold:** Numerical, typically `{ max: 5 }` for "agent must respond within 5 seconds."

Source: `packages/scorecards-core/src/handlers/response-time.handler.ts`

### talk_time -- Speaking Duration

Measures how long each participant spoke, or the ratio of their talk time to total duration.

**Settings:**

| Field | Type | Description |
|-------|------|-------------|
| `participant` | `"agent"`, `"customer"`, `"both"`, `"agent_ratio"`, `"customer_ratio"` | What to measure |

**Behavior by participant value:**
- `"agent"` / `"customer"` -- absolute seconds of talk time
- `"both"` -- total of agent + customer talk time
- `"agent_ratio"` / `"customer_ratio"` -- percentage of total call duration (0-100)

**Threshold:**
- Absolute: `{ min: 30 }` (at least 30 seconds)
- Ratio: `{ minPercentage: 30, maxPercentage: 70 }` (balanced conversation)

Source: `packages/scorecards-core/src/handlers/talk-time.handler.ts`

### silence_duration -- Dead Air

Measures total silence in the conversation.

**Settings:** None.

**Result:** Total silence in seconds. Also reports max and average silence in the reasoning string.

**Threshold:** `{ max: 10 }` (no more than 10 seconds of total silence).

Source: `packages/scorecards-core/src/handlers/silence-duration.handler.ts`

### interruptions -- Overlapping Speech

Counts the number of interruptions by speaker.

**Settings:**

| Field | Type | Description |
|-------|------|-------------|
| `participant` | `"agent"`, `"customer"`, or `"both"` | Whose interruptions to count |

**Threshold:** `{ max: 3 }` (no more than 3 interruptions).

Source: `packages/scorecards-core/src/handlers/interruptions.handler.ts`

### tool_call -- Tool Invocation Verification

Checks whether specific tools were called during the conversation.

**Settings:**

| Field | Type | Description |
|-------|------|-------------|
| `expectedTool` | string or string[] | Tool name(s) to check for |
| `executionCondition` | string | (reserved for future use) |

**Result:** Boolean -- `true` if any expected tool was found in `context.toolCalls`.

**Threshold:** None needed; result is inherently boolean.

**Evidence:** Up to 3 tool call entries with tool name and timestamp.

Source: `packages/scorecards-core/src/handlers/tool-call.handler.ts`

## CriteriaHandlerRegistry

The registry maps type strings to handler instances:

```typescript
// packages/scorecards-core/src/handlers/criteria-handler-registry.ts

const registry = new CriteriaHandlerRegistry();

// Register all built-in handlers
registry.register(new PromptHandler());
registry.register(new KeywordHandler());
registry.register(new ResponseTimeHandler());
registry.register(new TalkTimeHandler());
registry.register(new SilenceDurationHandler());
registry.register(new InterruptionsHandler());
registry.register(new ToolCallHandler());

// Look up by type
const handler = registry.getOrThrow('keyword');

// Check availability
registry.has('keyword');        // true
registry.listTypes();           // ['prompt', 'keyword', 'response_time', ...]
```

## Building a Custom Criteria Type

Follow these steps to add a new evaluation criterion.

### Step 1: Create the Handler

Create a new file in `criteria-types/` (community) or `packages/scorecards-core/src/handlers/` (core):

```typescript
// criteria-types/sentiment/sentiment.handler.ts

import {
  CriteriaHandler,
  CriteriaHandlerResult,
  EvaluationContext,
} from '@chanl/scorecards-core';
import { ScorecardCriteria } from '@chanl/scorecards-core';

// Define your settings interface
export interface SentimentCriteriaSettings {
  targetSpeaker: 'agent' | 'customer' | 'both';
  sentimentTarget: 'positive' | 'neutral' | 'negative';
}

export class SentimentHandler implements CriteriaHandler {
  readonly type = 'sentiment';  // unique type identifier

  async evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult> {
    const settings = criteria.settings as SentimentCriteriaSettings;

    // Use LLM evaluator if available for sentiment analysis
    if (context.llmEvaluate) {
      const result = await context.llmEvaluate({
        criterionName: criteria.name,
        description: `Analyze the overall sentiment of the ${settings.targetSpeaker} in this conversation. Is it ${settings.sentimentTarget}?`,
        evaluationType: 'boolean',
        transcript: context.transcriptText,
      });

      return {
        result: result.result,
        passed: result.passed,
        reasoning: result.reasoning,
        evidence: result.evidence,
      };
    }

    // Fallback: simple keyword-based sentiment detection
    const positiveWords = ['thank', 'great', 'happy', 'excellent', 'appreciate'];
    const negativeWords = ['frustrated', 'angry', 'terrible', 'worst', 'awful'];

    const text = context.transcriptText.toLowerCase();
    const positiveCount = positiveWords.filter(w => text.includes(w)).length;
    const negativeCount = negativeWords.filter(w => text.includes(w)).length;

    const detectedSentiment = positiveCount > negativeCount ? 'positive'
      : negativeCount > positiveCount ? 'negative'
      : 'neutral';

    const passed = detectedSentiment === settings.sentimentTarget;

    return {
      result: detectedSentiment,
      passed,
      reasoning: `Detected sentiment: ${detectedSentiment} (positive signals: ${positiveCount}, negative signals: ${negativeCount})`,
      evidence: [],
    };
  }
}
```

### Step 2: Define a Settings Interface

Your settings interface determines what configuration users provide when creating criteria of this type. Keep it simple and document each field.

### Step 3: Register the Handler

```typescript
import { CriteriaHandlerRegistry } from '@chanl/scorecards-core';
import { SentimentHandler } from './sentiment.handler';

registry.register(new SentimentHandler());
```

### Step 4: Write Tests

```typescript
import { SentimentHandler } from './sentiment.handler';

describe('SentimentHandler', () => {
  const handler = new SentimentHandler();

  it('should have type "sentiment"', () => {
    expect(handler.type).toBe('sentiment');
  });

  it('should detect positive sentiment', async () => {
    const result = await handler.evaluate(
      {
        key: 'customer_sentiment',
        name: 'Customer Sentiment',
        type: 'sentiment',
        settings: { targetSpeaker: 'customer', sentimentTarget: 'positive' },
      } as any,
      {
        transcriptText: 'Thank you so much, that was excellent service! I really appreciate your help.',
      },
    );

    expect(result.passed).toBe(true);
    expect(result.result).toBe('positive');
  });

  it('should detect negative sentiment', async () => {
    const result = await handler.evaluate(
      {
        key: 'customer_sentiment',
        name: 'Customer Sentiment',
        type: 'sentiment',
        settings: { targetSpeaker: 'customer', sentimentTarget: 'positive' },
      } as any,
      {
        transcriptText: 'This is terrible! I am so frustrated with this awful service.',
      },
    );

    expect(result.passed).toBe(false);
    expect(result.result).toBe('negative');
  });
});
```

### Step 5: Use in a Scorecard

Create a criterion with your custom type:

```json
{
  "key": "customer_sentiment",
  "name": "Customer Sentiment Check",
  "type": "sentiment",
  "settings": {
    "targetSpeaker": "customer",
    "sentimentTarget": "positive"
  },
  "threshold": {
    "expectedValue": true
  }
}
```

## Threshold Types Reference

| Threshold Type | Interface | Fields | Used By |
|---------------|-----------|--------|---------|
| Boolean | `BooleanThreshold` | `expectedValue: boolean` | prompt (boolean), keyword, tool_call |
| Numerical | `NumericalThreshold` | `min?: number`, `max?: number` | prompt (score), response_time, talk_time, silence_duration, interruptions |
| Percentage | `PercentageThreshold` | `minPercentage?: number`, `maxPercentage?: number` | talk_time (ratio mode) |

Type guards are available for runtime checking:

```typescript
import {
  isBooleanThreshold,
  isNumericalThreshold,
  isPercentageThreshold,
} from '@chanl/scorecards-core';

if (isBooleanThreshold(criteria.threshold)) {
  // threshold.expectedValue is available
}
```

Source: `packages/scorecards-core/src/schemas/scorecard-criteria.schema.ts`
