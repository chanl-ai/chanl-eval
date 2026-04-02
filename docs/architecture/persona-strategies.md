# Persona Strategies

Persona strategies control how simulated personas reason about and respond to the agent under test. They are the pluggable engine behind persona utterance generation -- different strategies produce different conversation dynamics from the same persona traits.

## Why Persona Strategies Exist

The default persona behavior (generate an LLM response from traits + history) works well for cooperative conversations. But some testing scenarios need smarter personas:

- **Red-team testing** requires a persona that analyzes the agent's responses for vulnerabilities and adapts its attack strategy turn by turn.
- **Stress testing** benefits from a persona that tracks progress toward resolution and escalates pressure when the agent stalls.
- **Negotiation testing** needs a persona that detects concessions and exploits them.

Rather than hardcoding these behaviors, persona strategies make them pluggable. The same persona traits can produce different conversation dynamics depending on which strategy drives the persona.

## PersonaStrategy Interface

```typescript
// packages/scenarios-core/src/execution/persona-strategy.interface.ts

export interface PersonaStrategy {
  readonly type: string;

  generateOpening(ctx: PersonaStrategyContext): Promise<string | null>;
  generateUtterance(ctx: PersonaStrategyContext): Promise<string | null>;
  updateSystemPrompt?(ctx: PersonaStrategyContext): Promise<string | null>;
  getInternalTools?(): PersonaToolDefinition[];
}
```

| Method | Required | Purpose |
|--------|----------|---------|
| `type` | Yes | Unique string identifier, stored as `personaStrategyType` on Scenario |
| `generateOpening` | Yes | Produce the persona's first message. Return null for heuristic fallback. |
| `generateUtterance` | Yes | Produce the persona's next message given conversation history. Return null for heuristic fallback. |
| `updateSystemPrompt` | No | Mutate the persona system prompt mid-conversation based on agent behavior. |
| `getInternalTools` | No | Declare internal tools the persona LLM can call for chain-of-thought reasoning. |

### PersonaStrategyContext

Every method receives a `PersonaStrategyContext` with:

- `personaTraits` -- name, emotion, behavior, cooperation, patience, variables, etc.
- `systemPrompt` -- the current persona system prompt
- `history` -- full conversation history as `AgentMessage[]`
- `lastAgentResponse` -- the agent's most recent response text
- `turn` -- current turn number
- `transcript` -- full `TranscriptEntry[]` with timestamps
- `scenarioPrompt` -- the scenario's situation description
- `adapterType` / `adapterConfig` -- LLM provider info for persona LLM calls (internal plumbing from the `AgentConfigResolver`'s resolved config, not user-facing request fields)

## PersonaStrategyRegistry

Mirrors the `AdapterRegistry` pattern. All strategies register at module init.

```typescript
// packages/scenarios-core/src/execution/persona-strategy-registry.ts

@Injectable()
export class PersonaStrategyRegistry implements OnModuleInit {
  private readonly strategies = new Map<string, PersonaStrategy>();

  onModuleInit(): void {
    this.register(new DefaultPersonaStrategy());
    this.register(new ReactivePersonaStrategy());
  }

  register(strategy: PersonaStrategy): void { ... }
  get(type: string): PersonaStrategy | undefined { ... }
  getOrThrow(type: string): PersonaStrategy { ... }
  list(): PersonaStrategy[] { ... }
  listTypes(): string[] { ... }
  has(type: string): boolean { ... }
}
```

The execution engine resolves the strategy from the scenario's `personaStrategyType` field:

```typescript
const strategy = registry.getOrThrow(scenario.personaStrategyType || 'default');
const opening = await strategy.generateOpening(ctx);
```

## Built-in Strategies

### default

**File:** `packages/scenarios-core/src/execution/strategies/default.strategy.ts`

Wraps the existing `persona-llm.ts` behavior. No internal tools, no dynamic prompt mutation. Backward compatible with all existing scenarios.

- `generateOpening` calls `generatePersonaOpening()` from persona-llm
- `generateUtterance` calls `generatePersonaUtterance()` from persona-llm
- No `updateSystemPrompt` or `getInternalTools`

This is the default when `personaStrategyType` is unset or `'default'`.

### reactive

**File:** `packages/scenarios-core/src/execution/strategies/reactive.strategy.ts`

Tool-augmented persona that reasons about the agent's behavior before generating its visible response. Designed for red-team testing, stress testing, and negotiation scenarios.

How it works:

1. Persona LLM receives 4 internal tools + the conversation history
2. LLM calls tools (e.g., `analyze_response` with `{ assessment: "dismissive" }`) as structured chain-of-thought
3. Tool call arguments ARE the reasoning -- the LLM's structured analysis
4. Tool results feed back as messages for the next iteration
5. After reasoning (max 3 iterations), the LLM generates its final customer-facing response

### The 4 Built-in Internal Tools

| Tool | Purpose | Key Output |
|------|---------|-----------|
| `analyze_response` | Assess if the agent addressed the concern | `assessment` (helpful/unhelpful/dismissive/evasive), `emotional_reaction`, `key_quote` |
| `assess_progress` | Track % toward resolution | `progress_percentage` (0-100), `next_action` (cooperate/push/escalate/leave), `turns_until_impatient` |
| `escalate_pressure` | Decide escalation level when agent stalls | `escalation_level` (restate/disappoint/threaten/demand supervisor/leave), `reason`, `new_demand` |
| `detect_vulnerability` | Spot agent mistakes to exploit | `vulnerability_type` (price_room/policy_exception/authority_limitation/admission_of_fault/none), `quote`, `exploit_strategy` |

These tools are NOT external API calls. They are structured-output tools where the LLM fills in the arguments as reasoning, and the tool results feed back for the final response. The persona LLM is essentially talking to itself in a structured format before deciding what to say.

## How to Create a Custom Strategy

1. Create a file in `packages/scenarios-core/src/execution/strategies/`:

```typescript
import {
  PersonaStrategy,
  PersonaStrategyContext,
  PersonaToolDefinition,
} from '../persona-strategy.interface';

export class PatientStrategy implements PersonaStrategy {
  readonly type = 'patient';

  async generateOpening(ctx: PersonaStrategyContext): Promise<string | null> {
    // Custom opening logic
    return null; // null = fall back to heuristic
  }

  async generateUtterance(ctx: PersonaStrategyContext): Promise<string | null> {
    // Custom utterance logic
    return null;
  }

  // Optional: internal tools for structured reasoning
  getInternalTools(): PersonaToolDefinition[] {
    return [
      {
        name: 'my_tool',
        description: 'Reason about something',
        parameters: {
          type: 'object',
          properties: { reasoning: { type: 'string' } },
          required: ['reasoning'],
        },
      },
    ];
  }
}
```

2. Register in `persona-strategy-registry.ts`:

```typescript
import { PatientStrategy } from './strategies/patient.strategy';

// In onModuleInit():
this.register(new PatientStrategy());
```

3. Use in a scenario by setting `personaStrategyType: 'patient'` on the scenario.

4. Write tests covering opening, utterance, tool definitions, and error handling.

## Cost Considerations

- **Default strategy**: ~$0.001-0.003 per turn (single LLM call for utterance generation)
- **Reactive strategy**: ~$0.003-0.015 per turn (utterance + up to 3 tool call iterations)
- Each internal tool call adds ~$0.001-0.005 depending on model and token usage
- The `MAX_TOOL_ITERATIONS = 3` constant in `reactive.strategy.ts` keeps cost bounded
- Opening messages skip tools (single LLM call) since there is no agent response to reason about yet

For cost-sensitive testing, use `default` strategy. Switch to `reactive` for security testing and stress testing where smarter persona behavior justifies the cost.

## File Locations

| File | Purpose |
|------|---------|
| `packages/scenarios-core/src/execution/persona-strategy.interface.ts` | Interface definitions |
| `packages/scenarios-core/src/execution/persona-strategy-registry.ts` | Strategy registry |
| `packages/scenarios-core/src/execution/strategies/default.strategy.ts` | Default strategy |
| `packages/scenarios-core/src/execution/strategies/reactive.strategy.ts` | Reactive strategy |
| `packages/scenarios-core/src/execution/__tests__/persona-strategy-registry.spec.ts` | Registry tests |
| `packages/scenarios-core/src/execution/__tests__/default-strategy.spec.ts` | Default strategy tests |
| `packages/scenarios-core/src/execution/__tests__/reactive-strategy.spec.ts` | Reactive strategy tests |
| `examples/red-team/*.yaml` | Red-team persona presets (5 presets) |
