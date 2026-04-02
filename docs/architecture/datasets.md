# Dataset Generation & Export

chanl-eval can generate training datasets from conversation executions. Run scenarios with multiple personas, then export the transcripts in industry-standard fine-tuning formats.

## Why Dataset Generation Exists

Existing eval tools score prompts. chanl-eval also *generates the training data* to improve them. The conversation engine (personas + scenarios + tool fixtures) produces realistic multi-turn dialogues that double as fine-tuning examples. This creates a closed loop: test -> identify gaps -> generate training data -> fine-tune -> re-test.

Use cases:
- **SFT (Supervised Fine-Tuning)** -- Generate diverse customer conversations to teach a model your agent's behavior
- **DPO (Direct Preference Optimization)** -- Run the same scenario with two models, export the higher-scored as preferred
- **Tool call training** -- Generate conversations with mock tools to teach a model when and how to call functions

## Architecture

Dataset generation spans all packages without introducing a new one:

| Package | Responsibility |
|---------|---------------|
| `scenarios-core` | Format converters (pure functions, no DB dependency) |
| `server` | API endpoints (batch generation, streaming export, preview) |
| `sdk` | TypeScript client methods |
| `cli` | `chanl dataset` command group |
| `dashboard` | Datasets page with generate dialog, view dialog, export dialog |

### Data Flow

```
1. User triggers batch generation (dashboard, CLI, or SDK)
   POST /datasets/generate { scenarioId, promptId, count: 10 }

2. Server creates N execution jobs via BullMQ
   Each execution stamped with batchId + auto-generated batchName

3. Execution processor runs conversations (persona <-> agent)
   Same pipeline as regular scenario execution

4. User exports completed batch as training data
   POST /datasets/export { format: "openai", filters: { batchId } }

5. Server streams JSONL/JSON, converting stepResults -> training format
   stepResultsToConversation() -> toOpenAIChatJsonl()
```

### Batch Identity

A **dataset** is identified by its `batchId` (UUID) stamped on every execution in the batch. The `batchName` is auto-generated from the scenario name, count, and date (e.g., "Angry Customer Refund x 10 -- Apr 2").

Schema fields on `ScenarioExecution`:
- `batchId: string` -- groups executions into a dataset (indexed)
- `batchName: string` -- human-readable label

## Export Formats

Four formats cover 95% of fine-tuning pipelines:

### OpenAI Chat (`openai`)

The universal format. Works with OpenAI, Together AI, Fireworks, Axolotl, Unsloth, LLaMA Factory.

```json
{"messages": [
  {"role": "system", "content": "You are a support agent..."},
  {"role": "user", "content": "I need to cancel my order"},
  {"role": "assistant", "content": "I can help with that. What's your order number?"}
]}
```

### OpenAI Chat + Tools (`openai-tools`)

Same as OpenAI Chat but includes tool definitions and tool call messages. Arguments are serialized as JSON **strings** per the OpenAI spec.

```json
{"tools": [{"type": "function", "function": {"name": "lookup_order", "parameters": {...}}}],
 "messages": [
  {"role": "user", "content": "Cancel order ORD-4521"},
  {"role": "assistant", "tool_calls": [{"id": "call_1", "type": "function", "function": {"name": "lookup_order", "arguments": "{\"order_id\":\"ORD-4521\"}"}}]},
  {"role": "tool", "tool_call_id": "call_1", "content": "{\"status\":\"active\"}"},
  {"role": "assistant", "content": "Your order has been cancelled."}
]}
```

### ShareGPT (`sharegpt`)

Used by LLaMA Factory and older open-source fine-tuning tools. Uses `from`/`value` instead of `role`/`content`.

```json
{"conversations": [
  {"from": "system", "value": "You are a support agent..."},
  {"from": "human", "value": "I need to cancel my order"},
  {"from": "gpt", "value": "I can help with that."}
]}
```

Tool calls are either omitted (default) or inlined as text (`toolHandling: 'inline'`).

### DPO Preference (`dpo`)

For Direct Preference Optimization. Pairs two executions of the same scenario -- the higher-scored conversation becomes `preferred_output`.

```json
{"input": {"messages": [{"role": "user", "content": "I need a refund."}]},
 "preferred_output": [{"role": "assistant", "content": "I've processed a full refund."}],
 "non_preferred_output": [{"role": "assistant", "content": "Check our refund policy."}]}
```

DPO export groups executions by scenario, sorts by score, and pairs the top half with the bottom half.

## Format Converters

All converters are pure functions in `scenarios-core/src/dataset/`. No database access, no side effects.

### Conversion Pipeline

```
StepResult[] (from MongoDB)
  -> stepResultsToConversation(stepResults, options)
  -> ConversationRecord { messages, systemPrompt, tools, metadata }
  -> toOpenAIChatJsonl(record) | toShareGPTJsonl(record) | toDPOJsonl(a, b)
  -> JSONL string (one line per conversation)
```

### Role Mapping

| Execution role | Training data role |
|---------------|-------------------|
| `persona` | `user` (OpenAI) / `human` (ShareGPT) |
| `agent` | `assistant` (OpenAI) / `gpt` (ShareGPT) |
| `tool` | Split into `assistant` (with `tool_calls`) + `tool` (result) |

### ConversationRecord Interface

```typescript
interface ConversationRecord {
  messages: ConversationMessage[];
  systemPrompt?: string;
  tools?: ToolDefinition[];
  metadata: ConversationMetadata;
}
```

Metadata (executionId, scenarioId, score, turns, etc.) travels alongside the conversation but is **never included in the training output**. It can be exported as a companion `metadata.jsonl` for filtering.

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/datasets` | GET | List all dataset batches with aggregated stats |
| `/datasets/:batchId/conversations` | GET | Paginated conversations within a batch |
| `/datasets/generate` | POST | Create a batch of N executions |
| `/datasets/generate/:batchId/status` | GET | Batch progress (running/completed/partial/failed) |
| `/datasets/export` | POST | Stream training data as JSONL/JSON download |
| `/datasets/export/preview` | GET | Count, avg score, and sample line before downloading |

## CLI Commands

```bash
chanl dataset generate --scenario "Angry Refund" --prompt-id <id> --count 50
chanl dataset status <batchId>
chanl dataset export --format openai --min-score 70 --output data.jsonl
chanl dataset preview --format openai

# Full pipeline: generate + wait + export
chanl dataset generate --scenario "Angry Refund" --prompt-id <id> --count 50 \
  --wait --export openai --min-score 70 --output data.jsonl
```

## File Locations

| File | Purpose |
|------|---------|
| `scenarios-core/src/dataset/types.ts` | ConversationRecord, export format types, output line types |
| `scenarios-core/src/dataset/convert.ts` | stepResults -> ConversationRecord conversion |
| `scenarios-core/src/dataset/formats/openai.ts` | OpenAI Chat JSONL converter |
| `scenarios-core/src/dataset/formats/sharegpt.ts` | ShareGPT JSON converter |
| `scenarios-core/src/dataset/formats/dpo.ts` | DPO preference pair converter |
| `server/src/dataset/dataset.service.ts` | Batch generation, export streaming, preview |
| `server/src/dataset/dataset.controller.ts` | API endpoints |
| `sdk/src/modules/datasets.ts` | SDK client methods |
| `cli/src/commands/dataset.ts` | CLI commands |
| `dashboard/app/(dashboard)/datasets/page.tsx` | Dashboard UI |
| `dashboard/app/(dashboard)/datasets/columns.tsx` | Table column definitions |
