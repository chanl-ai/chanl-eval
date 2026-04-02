# Contributing to chanl-eval

Thank you for your interest in contributing to chanl-eval. This guide covers development setup, contribution patterns, and the PR process.

## Development Setup

### Prerequisites

- Node.js >= 18
- pnpm >= 8
- Docker and Docker Compose (for MongoDB and Redis)
- Git

### Clone and Install

```bash
git clone https://github.com/chanl-ai/chanl-eval.git
cd chanl-eval
pnpm install
```

### Start Infrastructure

```bash
docker compose up -d   # MongoDB + Redis
```

### Build All Packages

```bash
pnpm build
```

### Run Tests

```bash
pnpm test              # all packages
pnpm test:cov          # with coverage
```

### Start the Server

```bash
cd packages/server
pnpm start:dev         # NestJS hot-reload on port 18005
```

API docs are available at `http://localhost:18005/api/docs`.

## Project Structure

```
chanl-eval/
├── packages/
│   ├── scenarios-core/    # Personas, scenarios, execution, adapters
│   ├── scorecards-core/   # Scorecards, criteria handlers, evaluation
│   ├── server/            # NestJS HTTP server
│   ├── cli/               # CLI tool
│   ├── sdk/               # TypeScript SDK
│   └── dashboard/         # React UI (planned)
├── adapters/              # Community agent adapters
├── criteria-types/        # Community criteria handlers
├── templates/             # Scenario templates
└── examples/              # Example scenarios
```

## How to Contribute Adapters

Agent adapters connect chanl-eval to AI agent platforms. See [docs/architecture/adapters.md](docs/architecture/adapters.md) for the full architecture.

### Quick Steps

1. Create a directory under `adapters/` for your adapter:
   ```
   adapters/my-platform/
   ├── my-platform.adapter.ts
   ├── my-platform.adapter.spec.ts
   ├── index.ts
   ├── package.json
   └── README.md
   ```

2. Implement the `AgentAdapter` interface:
   ```typescript
   import { AgentAdapter, AgentAdapterConfig, AgentMessage, AgentResponse } from '@chanl/scenarios-core';

   export class MyPlatformAdapter implements AgentAdapter {
     readonly name = 'MyPlatform';
     readonly type = 'my-platform';

     async connect(config: AgentAdapterConfig): Promise<void> { /* ... */ }
     async sendMessage(message: string, history: AgentMessage[]): Promise<AgentResponse> { /* ... */ }
     async disconnect(): Promise<void> { /* ... */ }
   }
   ```

3. Write tests covering:
   - Connection with valid config
   - Connection failure with missing required config
   - Sending a message (mock the external API)
   - Handling API errors
   - Disconnection and cleanup

4. Add a README.md documenting:
   - What platform the adapter supports
   - Required and optional configuration fields
   - Usage example

## How to Contribute Criteria Types

Criteria handlers evaluate specific aspects of a conversation. See [docs/architecture/criteria-types.md](docs/architecture/criteria-types.md) for the full architecture.

### Quick Steps

1. Create a directory under `criteria-types/` for your handler:
   ```
   criteria-types/sentiment/
   ├── sentiment.handler.ts
   ├── sentiment.handler.spec.ts
   ├── index.ts
   ├── package.json
   └── README.md
   ```

2. Implement the `CriteriaHandler` interface:
   ```typescript
   import { CriteriaHandler, CriteriaHandlerResult, EvaluationContext } from '@chanl/scorecards-core';
   import { ScorecardCriteria } from '@chanl/scorecards-core';

   export class SentimentHandler implements CriteriaHandler {
     readonly type = 'sentiment';

     async evaluate(
       criteria: ScorecardCriteria,
       context: EvaluationContext,
     ): Promise<CriteriaHandlerResult> {
       // Your evaluation logic here
       return { result, passed, reasoning, evidence };
     }
   }
   ```

3. Write tests covering:
   - Handler has the correct `type` property
   - Evaluation with valid context data
   - Evaluation with missing/empty data (graceful fallback)
   - Threshold checking
   - Evidence extraction

4. Add a README.md documenting:
   - What the handler evaluates
   - Settings interface with field descriptions
   - Recommended threshold configurations
   - Usage example

## How to Contribute Persona Strategies

Persona strategies control how the simulated persona reasons and generates utterances during a conversation. The default strategy wraps the existing persona LLM behavior. The reactive strategy adds internal tools that let the persona reason about the agent's responses before replying.

See [docs/architecture/persona-strategies.md](docs/architecture/persona-strategies.md) for the full architecture.

### The PersonaStrategy Interface

```typescript
import { PersonaStrategy, PersonaStrategyContext, PersonaToolDefinition } from '@chanl/scenarios-core';

export interface PersonaStrategy {
  readonly type: string;

  generateOpening(ctx: PersonaStrategyContext): Promise<string | null>;
  generateUtterance(ctx: PersonaStrategyContext): Promise<string | null>;
  updateSystemPrompt?(ctx: PersonaStrategyContext): Promise<string | null>;
  getInternalTools?(): PersonaToolDefinition[];
}
```

- `type` — unique identifier for the strategy (used in `personaStrategyType` on scenarios)
- `generateOpening` — produce the persona's first message. Return null to fall back to heuristic opening.
- `generateUtterance` — produce the persona's next message given the conversation history. Return null to fall back to heuristic generation.
- `updateSystemPrompt` — (optional) mutate the persona's system prompt mid-conversation based on agent behavior.
- `getInternalTools` — (optional) declare internal tools the persona LLM can call for self-reflective reasoning.

### Quick Steps

1. Create your strategy file in `packages/scenarios-core/src/execution/strategies/`:
   ```
   packages/scenarios-core/src/execution/strategies/
   ├── default.strategy.ts
   ├── reactive.strategy.ts
   └── my-custom.strategy.ts      ← your new strategy
   ```

2. Implement the `PersonaStrategy` interface:
   ```typescript
   import {
     PersonaStrategy,
     PersonaStrategyContext,
   } from '../persona-strategy.interface';

   export class MyCustomStrategy implements PersonaStrategy {
     readonly type = 'my-custom';

     async generateOpening(ctx: PersonaStrategyContext): Promise<string | null> {
       // Your opening message logic
       return null; // null = fall back to heuristic
     }

     async generateUtterance(ctx: PersonaStrategyContext): Promise<string | null> {
       // Your utterance generation logic
       return null;
     }
   }
   ```

3. Register in `packages/scenarios-core/src/execution/persona-strategy-registry.ts`:
   ```typescript
   import { MyCustomStrategy } from './strategies/my-custom.strategy';

   // In onModuleInit():
   this.register(new MyCustomStrategy());
   ```

4. Write tests in `packages/scenarios-core/src/execution/__tests__/my-custom-strategy.spec.ts` covering:
   - Strategy has the correct `type` property
   - `generateOpening` returns a string or null
   - `generateUtterance` handles conversation history correctly
   - Internal tools (if any) return valid definitions
   - Error handling (LLM failures return null gracefully)

5. Update docs (this file and `docs/architecture/persona-strategies.md`)

### How Internal Tools Work

Internal tools are **self-reflective chain-of-thought** tools, NOT external API calls. They work like this:

1. The persona LLM receives tool definitions along with the conversation history
2. The LLM "calls" a tool by providing structured arguments (e.g., `analyze_response → { assessment: "dismissive", emotional_reaction: "frustrated" }`)
3. The tool call arguments ARE the reasoning — the LLM's structured analysis of the conversation
4. Tool results feed back as messages so the LLM can use its own reasoning to generate the final customer-facing response
5. Maximum 3 iterations per turn to bound cost (~$0.001-0.005 per tool call)

Example tool definition from the reactive strategy:

```typescript
const PERSONA_TOOLS: PersonaToolDefinition[] = [
  {
    name: 'assess_progress',
    description:
      'Evaluate whether this conversation is making progress toward resolving your issue.',
    parameters: {
      type: 'object',
      properties: {
        progress_percentage: {
          type: 'number',
          description: 'How close you are to resolution (0-100)',
        },
        next_action: {
          type: 'string',
          enum: ['continue_cooperatively', 'push_harder', 'accept_offer', 'threaten_to_leave', 'request_supervisor'],
          description: 'What you should do next',
        },
        turns_until_impatient: {
          type: 'number',
          description: 'How many more turns before you escalate or give up',
        },
      },
      required: ['progress_percentage', 'next_action'],
    },
  },
];
```

## Extension Points

chanl-eval has three pluggable systems that follow the same registry pattern:

| Extension | Interface | Registry | Example |
|-----------|-----------|----------|---------|
| Agent Adapter | `AgentAdapter` | `AdapterRegistry` | `openai.adapter.ts` |
| Criteria Handler | `CriteriaHandler` | `CriteriaHandlerRegistry` | `prompt.handler.ts` |
| Persona Strategy | `PersonaStrategy` | `PersonaStrategyRegistry` | `reactive.strategy.ts` |

Each follows the same pattern: implement the interface, register in the corresponding registry, write tests, add docs.

## How to Contribute Templates

Scenario templates are pre-built scenario configurations that others can use as starting points.

### Quick Steps

1. Create a YAML file under `templates/`:
   ```
   templates/
   ├── customer-service.yaml
   ├── sales-qualification.yaml
   └── technical-support.yaml
   ```

2. Include at minimum:
   ```yaml
   name: "Frustrated Customer - Billing Issue"
   description: "Tests agent handling of an angry customer with a billing dispute"
   category: support
   difficulty: hard

   persona:
     name: "Karen"
     emotion: frustrated
     speechStyle: fast
     intentClarity: slightly unclear
     behavior:
       cooperationLevel: difficult
       patience: impatient

   prompt: >
     You are a customer who was charged twice for a subscription.
     You have already called once before about this issue.
     You want a full refund and an apology.

   scorecard:
     categories:
       - name: "De-escalation"
         weight: 40
         criteria:
           - key: empathy_shown
             type: prompt
             settings:
               description: "Did the agent acknowledge the customer's frustration?"
               evaluationType: boolean
   ```

3. Test that the template loads and validates correctly.

## Code Style

- **TypeScript** for all packages
- **NestJS conventions** for modules, services, controllers, DTOs
- **class-validator** decorators for DTO validation
- Use `findByIdAndUpdate()` instead of `doc.save()` for updates
- Use `.id` (not `._id`) in JSON responses (virtual ID plugin handles this)
- Prefer explicit types over `any`
- Write JSDoc comments for public interfaces and methods

## Testing Requirements

All contributions must include tests.

- **Unit tests** -- Jest, co-located with source files or in `__tests__/` directories
- **Naming** -- `*.spec.ts` for unit tests
- **Mocking** -- Use `jest.fn()` for external dependencies; use `mongodb-memory-server` for database tests
- **Coverage** -- Aim for meaningful coverage; do not write tests that only check existence

Run tests before submitting:

```bash
pnpm test
```

## PR Process

1. **Fork and branch** -- Create a feature branch from `main`:
   ```bash
   git checkout -b feat/my-adapter
   ```

2. **Make changes** -- Follow the patterns above for your contribution type.

3. **Write tests** -- All new code must have tests.

4. **Run checks locally:**
   ```bash
   pnpm build          # ensure everything compiles
   pnpm test           # ensure all tests pass
   pnpm lint           # ensure code style
   ```

5. **Commit** -- Use conventional commit messages:
   ```
   feat(adapters): add MyPlatform adapter
   fix(scorecards): correct weighted average calculation
   docs: update adapter contribution guide
   test(handlers): add sentiment handler tests
   ```

6. **Open a PR** -- Target the `main` branch. Include:
   - Summary of changes
   - Link to any relevant issues
   - Test plan describing how you verified the changes

7. **Review** -- Maintainers will review and provide feedback. Address comments and push updates to the same branch.

## Questions?

Open an issue on GitHub with the `question` label.
