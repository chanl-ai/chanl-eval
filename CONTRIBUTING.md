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
   import { AgentAdapter, AgentAdapterConfig, AgentMessage, AgentResponse } from '@chanl-ai/scenarios-core';

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
   import { CriteriaHandler, CriteriaHandlerResult, EvaluationContext } from '@chanl-ai/scorecards-core';
   import { ScorecardCriteria } from '@chanl-ai/scorecards-core';

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
