# CLI Reference

The `chanl` CLI manages scenarios, personas, scorecards, tool fixtures, executions, and datasets from the terminal. It connects to the chanl-eval server API.

## Installation

```bash
# From the repo (development)
pnpm install && pnpm build
npx chanl --help

# Global install (when published)
npm install -g @chanl/eval-cli
```

## Configuration

```bash
chanl config set server http://localhost:18005   # Server URL
chanl config set apiKey <key>                    # API key (optional)
chanl config get server                          # Verify
```

Config is stored in `~/.chanl/config.json`.

## Server Management

```bash
chanl server start      # docker compose up (generates compose file if missing)
chanl server stop       # docker compose down
chanl server status     # Health check + container status
chanl server logs       # Stream logs (Ctrl+C to stop)
chanl server logs server # Logs for a specific service
```

## Scenarios

```bash
chanl scenarios list                          # List all scenarios
chanl scenarios list --status active          # Filter by status
chanl scenarios get <id>                      # Get scenario details
chanl scenarios create --name "Refund Request" --prompt "I want a refund" --persona-ids <id1>,<id2>
chanl scenarios update <id> --name "New Name" --difficulty hard
chanl scenarios delete <id>                   # Interactive confirm
chanl scenarios delete <id> --force           # Skip confirm
chanl scenarios import scenarios/             # Import YAML files from a directory
chanl scenarios import my-scenario.yaml       # Import a single YAML file
chanl scenarios results <executionId>         # View execution results
```

### Running Scenarios

```bash
chanl scenarios run <id> --prompt-id <promptId>             # Run by ID
chanl scenarios run "Angry Customer Refund" --prompt-id <id> # Run by name
chanl scenarios run scenario.yaml --prompt-id <id>          # Run from YAML file
chanl scenarios run --all --prompt-id <id>                  # Run all active scenarios

# Shortcut (same as scenarios run)
chanl run <id-or-name-or-file> --prompt-id <id>
```

The `--prompt-id` flag is required. The Prompt entity (created in the dashboard or API) defines the agent under test. The server resolves adapter config from the Prompt + Settings.

Options:
- `--persona-id <id>` — Override persona
- `--scorecard-id <id>` — Override scorecard
- `--tools <id1,id2>` — Attach tool fixtures
- `--mode text|phone` — Execution mode (default: text)
- `--dry-run` — Validate without executing
- `--no-wait` — Don't poll for completion

## Personas

```bash
chanl personas list                           # List all personas
chanl personas list --emotion frustrated      # Filter by emotion
chanl personas get <id>                       # Get persona details
chanl personas create --name "Angry Karen" --emotion frustrated --speech-style fast
chanl personas update <id> --emotion calm --description "Updated"
chanl personas delete <id> --force
chanl personas defaults                       # Seed default personas
```

Create options: `--name`, `--emotion` (required), `--gender`, `--language`, `--accent`, `--speech-style`, `--description`, `--backstory`, `--tags`.

## Scorecards

```bash
chanl scorecards list                         # List all scorecards
chanl scorecards get <id>                     # Get scorecard details
chanl scorecards create --name "Sales Quality" --threshold 80 --algorithm weighted_average
chanl scorecards delete <id> --force
chanl scorecards default                      # Get the default scorecard
```

Create options: `--name` (required), `--description`, `--status`, `--threshold` (0-100, default 70), `--algorithm` (weighted_average, simple_average, minimum_all, pass_fail), `--tags`, `--from-template`.

## Tool Fixtures

Mock tools for scenario testing. Define parameters, mock responses, and verify your agent calls the right tool with the right arguments.

```bash
chanl tool-fixtures list                      # List all fixtures
chanl tool-fixtures get <id>                  # Get fixture details (shows mock rules)
chanl tool-fixtures create --name "check_order" --description "Look up order status"
chanl tool-fixtures create --file fixture.json  # Create from JSON/YAML file
chanl tool-fixtures update <id> --name "new_name" --tags "support,orders"
chanl tool-fixtures delete <id> --force
```

## Executions

Browse execution history and inspect results.

```bash
chanl executions list                         # Recent executions
chanl executions list --status completed      # Filter by status
chanl executions list --scenario <id>         # Filter by scenario
chanl executions show <executionId>           # Full details: transcript + scorecard
```

The `show` command displays the conversation transcript, scorecard criteria results with pass/fail, latency stats, and score bar.

## Datasets

Generate training data from conversation executions and export in fine-tuning formats.

```bash
# Generate a dataset (batch of conversations)
chanl dataset generate --scenario "Angry Refund" --prompt-id <id> --count 50
chanl dataset generate --scenario <id> --prompt-id <id> --personas <id1,id2> --count 10

# Check batch progress
chanl dataset status <batchId>

# Export as training data
chanl dataset export --format openai --output training-data.jsonl
chanl dataset export --format openai-tools --min-score 70 --output tools.jsonl
chanl dataset export --format sharegpt --output sharegpt.json
chanl dataset export --format dpo --output preferences.jsonl

# Preview before downloading
chanl dataset preview --format openai --min-score 70

# Full pipeline: generate + wait + export in one command
chanl dataset generate --scenario "Angry Refund" --prompt-id <id> --count 50 \
  --wait --export openai --min-score 70 --output data.jsonl
```

Export formats:

| Format | Extension | Compatible with |
|--------|-----------|----------------|
| `openai` | `.jsonl` | OpenAI, Together AI, Fireworks, Axolotl, Unsloth |
| `openai-tools` | `.jsonl` | Same, with tool call training data |
| `sharegpt` | `.json` | LLaMA Factory, legacy open-source |
| `dpo` | `.jsonl` | OpenAI DPO, Together preference, TRL DPOTrainer |

Filter options: `--scenario <ids>`, `--persona <ids>`, `--min-score <n>`, `--batch <id>`, `--system-prompt <prompt>`.

## Testing (CI/CD)

Run scenario tests with pass/fail assertions, like jest for AI agents. Define tests in YAML:

```yaml
# tests/refund-test.yaml
scenario: "Angry Customer Refund"
promptId: "68abc123..."
assertions:
  - type: score_above
    value: 70
  - type: criteria_pass
    criteria: empathy
  - type: no_errors
  - type: max_turns
    value: 12
```

```bash
chanl test tests/                     # Run all test files in directory
chanl test tests/refund-test.yaml     # Run a single test
chanl test tests/ --json              # JSON output for CI pipelines
chanl test tests/ --save-baseline     # Save results as baseline snapshot
chanl test tests/ --baseline          # Compare against saved baseline
```

Exit code 1 if any test fails or any assertion regresses. Use `--json` for CI integration.

### Assertion Types

| Type | Description |
|------|-------------|
| `score_above` | Overall score >= value |
| `score_below` | Overall score <= value |
| `criteria_pass` | Named criterion passes |
| `criteria_fail` | Named criterion fails |
| `no_errors` | No error messages |
| `max_turns` | Conversation <= N turns |
| `min_turns` | Conversation >= N turns |
| `status` | Execution status matches |

## Model Comparison

Compare two prompts (models/configurations) on the same scenario:

```bash
chanl compare \
  --scenario "Angry Customer Refund" \
  --prompt-a <promptIdA> \
  --prompt-b <promptIdB>
```

Outputs a side-by-side metrics table (score, latency, turns, duration) with a winner. Add `--json` for full transcripts.

## Project Scaffolding

```bash
chanl init                            # Scaffold in current directory
chanl init my-project                 # Scaffold in new directory
chanl init -t customer-support        # Use industry template
```

Creates: `agents/my-agent.yaml`, `scenarios/`, `.env`, `README.md`.

## Templates

```bash
chanl templates                       # List available template packs
```

## Global Options

```bash
chanl --json <command>                # JSON output (all commands)
chanl -f json <command>               # Same as --json
chanl -v                              # Version
chanl --help                          # Help
chanl <command> --help                # Command-specific help
```

## Authentication

```bash
chanl login                           # Interactive API key prompt
chanl login -k <apiKey>               # Non-interactive
```

Stores the key in `~/.chanl/config.json` and verifies against the server.

## Analytics

Anonymous usage analytics (opt-in):

```bash
chanl analytics status                # Check if enabled
chanl analytics enable                # Enable
chanl analytics disable               # Disable
```

## Environment Variables

The CLI reads from both `~/.chanl/config.json` and environment variables. Config file takes precedence.

| Variable | Purpose |
|----------|---------|
| `CHANL_SERVER_URL` | Server URL |
| `CHANL_API_KEY` | API key |
| `CHANL_PROVIDER` | Default provider (openai, anthropic, http) |
| `CHANL_OPENAI_API_KEY` | OpenAI API key |
| `CHANL_ANTHROPIC_API_KEY` | Anthropic API key |
| `CHANL_HTTP_ENDPOINT` | HTTP adapter endpoint |
| `CHANL_HTTP_API_KEY` | HTTP adapter API key |
