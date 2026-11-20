# chanl-eval — Makefile
# AI agent testing engine: scenarios, personas, tool fixtures, scorecards

SERVER_URL ?= http://localhost:18005
API = $(SERVER_URL)/api/v1
OPENAI_KEY ?= $(shell doppler secrets get OPENAI_API_KEY --project chanl-platform --config dev --plain 2>/dev/null)
PROVIDER ?= openai
MODEL ?= gpt-4o-mini
TEMP ?= 0.3
MAX_TOKENS ?= 300

# ─── Help ────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show all targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'

# ─── Infrastructure ──────────────────────────────────────────────────────────

.PHONY: infra server dashboard build seed

infra: ## Start MongoDB + Redis containers
	cd $(CURDIR) && docker compose up -d

docker-verify: ## Static + full `docker compose build` check (run before releasing Docker changes)
	@node $(CURDIR)/scripts/verify-dockerfile-packages.mjs
	@echo ""
	@echo "Running full docker compose build (this may take a minute)..."
	@cd $(CURDIR) && docker compose build server dashboard
	@echo "✅ Docker images build end-to-end"

server: ## Start server with hot reload (port 18005)
	cd $(CURDIR)/packages/server && pnpm start:dev

dashboard: ## Start dashboard (port 3010)
	cd $(CURDIR)/packages/dashboard && pnpm dev

build: ## Build all packages
	cd $(CURDIR) && pnpm build

seed: ## Seed sample data (scenarios, personas, scorecards, tool fixtures)
	cd $(CURDIR)/packages/server && pnpm seed

health: ## Check server health
	@curl -s $(SERVER_URL)/health | python3 -m json.tool

# ─── API Shortcuts ───────────────────────────────────────────────────────────

.PHONY: scenarios personas tools executions

scenarios: ## List scenarios
	@curl -s $(API)/scenarios | python3 -c "\
	import sys,json; \
	[print(f'  {s[\"id\"]}  {s[\"name\"]:30s}  {s.get(\"difficulty\",\"\")}') \
	 for s in json.load(sys.stdin).get('scenarios',[])]"

personas: ## List personas
	@curl -s $(API)/personas | python3 -c "\
	import sys,json; \
	[print(f'  {p[\"id\"]}  {p[\"name\"]:20s}  {p.get(\"emotion\",\"\")}') \
	 for p in json.load(sys.stdin).get('personas',[])]"

tools: ## List tool fixtures
	@curl -s $(API)/tool-fixtures | python3 -c "\
	import sys,json; \
	[print(f'  {t[\"id\"]}  {t[\"name\"]:25s}  {len(t.get(\"mockResponses\",[]))} mocks') \
	 for t in json.load(sys.stdin).get('toolFixtures',[])]"

executions: ## List recent executions (LIMIT=5)
	@curl -s '$(API)/scenarios/executions?limit=$(or $(LIMIT),5)' | python3 -c "\
	import sys,json; \
	[print(f'  {e[\"id\"]}  {e[\"status\"]:10s}  steps={len(e.get(\"stepResults\",[]))}  tools={sum(1 for s in e.get(\"stepResults\",[]) if s.get(\"role\")==\"tool\")}  {e.get(\"createdAt\",\"\")[:19]}') \
	 for e in json.load(sys.stdin).get('executions',[])]"

# ─── Run Scenarios ───────────────────────────────────────────────────────────

.PHONY: run run-with-tools transcript

run: ## Run scenario: make run SCENARIO=<id> PERSONA=<id> PROMPT="..."
ifndef SCENARIO
	$(error SCENARIO is required. Run 'make scenarios' to list IDs)
endif
	@echo "Running scenario $(SCENARIO)..."
	@EXEC_ID=$$(curl -s -X POST $(API)/scenarios/$(SCENARIO)/execute \
		-H 'Content-Type: application/json' \
		-d '{"mode":"text","personaId":"$(PERSONA)","adapterType":"$(PROVIDER)","adapterConfig":{"apiKey":"$(OPENAI_KEY)","model":"$(MODEL)","systemPrompt":"$(or $(PROMPT),You are a helpful customer support agent.)","temperature":$(TEMP),"maxTokens":$(MAX_TOKENS)}}' \
		| python3 -c "import sys,json; print(json.load(sys.stdin)['execution']['id'])") && \
	echo "Execution: $$EXEC_ID" && \
	echo "Polling..." && \
	$(MAKE) --no-print-directory _poll EXEC_ID=$$EXEC_ID

run-with-tools: ## Run with tools: make run-with-tools SCENARIO=<id> PERSONA=<id> TOOLS=<id1,id2> PROMPT="..."
ifndef SCENARIO
	$(error SCENARIO is required. Run 'make scenarios' to list IDs)
endif
ifndef TOOLS
	$(error TOOLS is required (comma-separated IDs). Run 'make tools' to list IDs)
endif
	@echo "Running scenario $(SCENARIO) with tools $(TOOLS)..."
	@TOOL_ARRAY=$$(echo '$(TOOLS)' | python3 -c "import sys; print('[' + ','.join(['\"'+t.strip()+'\"' for t in sys.stdin.read().strip().split(',')]) + ']')") && \
	EXEC_ID=$$(curl -s -X POST $(API)/scenarios/$(SCENARIO)/execute \
		-H 'Content-Type: application/json' \
		-d "{\"mode\":\"text\",\"personaId\":\"$(PERSONA)\",\"adapterType\":\"$(PROVIDER)\",\"adapterConfig\":{\"apiKey\":\"$(OPENAI_KEY)\",\"model\":\"$(MODEL)\",\"systemPrompt\":\"$(or $(PROMPT),You are a helpful customer support agent with access to tools. Use them when relevant.)\",\"temperature\":$(TEMP),\"maxTokens\":$(MAX_TOKENS)},\"toolFixtureIds\":$$TOOL_ARRAY}" \
		| python3 -c "import sys,json; print(json.load(sys.stdin)['execution']['id'])") && \
	echo "Execution: $$EXEC_ID" && \
	echo "Polling..." && \
	$(MAKE) --no-print-directory _poll EXEC_ID=$$EXEC_ID

# Quick aliases with defaults
run-billing: ## Quick: run Billing Question scenario with Angry Karen + order tools
	@$(MAKE) --no-print-directory run-with-tools \
		SCENARIO=69cc6f91c14e77afe08c9328 \
		PERSONA=69cc6f91c14e77afe08c9329 \
		TOOLS=69cca4d8394d5be63c32dd9e,69cca4d8394d5be63c32dd9f \
		PROMPT="You are a customer support agent. Use check_order_status with order_id ORD-123 when a customer mentions billing. Use process_refund if they want a refund. Only call each tool once."

run-product: ## Quick: run Product Inquiry scenario with Curious Maria (no tools)
	@$(MAKE) --no-print-directory run \
		SCENARIO=69cc6f91c14e77afe08c9327 \
		PERSONA=69cc6f91c14e77afe08c932b

transcript: ## Show transcript: make transcript EXEC=<id>
ifndef EXEC
	$(error EXEC is required. Run 'make executions' to list IDs)
endif
	@curl -s $(API)/scenarios/executions/$(EXEC) | python3 -c "\
	import sys, json; \
	d = json.load(sys.stdin)['execution']; \
	print(f'Status: {d[\"status\"]}  Score: {d.get(\"overallScore\")}  Duration: {d.get(\"duration\")}ms  Steps: {len(d[\"stepResults\"])}'); \
	tc = [s for s in d['stepResults'] if s.get('role')=='tool']; \
	print(f'Tool calls: {len(tc)}'); \
	print(); \
	[( \
		print(f'  [{i}] 🔧 TOOL   {s[\"toolCalls\"][0][\"name\"]}({json.dumps(s[\"toolCalls\"][0][\"arguments\"])})') or \
		print(f'              → {json.dumps(s[\"toolCalls\"][0][\"result\"])}') \
	) if s.get('role')=='tool' and s.get('toolCalls') else \
	print(f'  [{i}] {\"🟣 PERSONA\" if s.get(\"role\")==\"persona\" else \"🟢 AGENT  \"} {(s.get(\"actualResponse\",\"\") or \"\")[:180]}') \
	for i, s in enumerate(d['stepResults'])] or None; \
	print()"

# ─── Internal ────────────────────────────────────────────────────────────────

_poll:
	@for i in $$(seq 1 40); do \
		sleep 5; \
		STATUS=$$(curl -s "$(API)/scenarios/executions/$(EXEC_ID)" | python3 -c "import sys,json; print(json.load(sys.stdin).get('execution',{}).get('status','?'))" 2>/dev/null); \
		echo "  [$$i] $$STATUS"; \
		if [ "$$STATUS" = "completed" ] || [ "$$STATUS" = "failed" ]; then \
			echo ""; \
			$(MAKE) --no-print-directory transcript EXEC=$(EXEC_ID); \
			break; \
		fi; \
	done

# ─── Testing ─────────────────────────────────────────────────────────────────

.PHONY: test test-unit lint typecheck

test: ## Run all tests
	cd $(CURDIR) && pnpm test

test-unit: ## Run unit tests for a package: make test-unit PKG=scenarios-core
	cd $(CURDIR)/packages/$(or $(PKG),scenarios-core) && pnpm test

lint: ## Lint all packages
	cd $(CURDIR) && pnpm lint

typecheck: ## Typecheck all packages
	cd $(CURDIR) && pnpm -r exec tsc --noEmit

# ─── Database ────────────────────────────────────────────────────────────────

.PHONY: db-shell db-reset

db-shell: ## Open MongoDB shell
	mongosh mongodb://localhost:27217/chanl-eval

db-reset: ## Drop database and re-seed
	mongosh mongodb://localhost:27217/chanl-eval --eval "db.dropDatabase()" && \
	$(MAKE) seed

# ─── Workshop room (Fly org chanl-dev) ───────────────────────────────────────
# Credentials: ~/.chanl-eval-room.env (outside the repo). Seats are private; these targets reach
# them through `fly proxy`. Spec: one seat machine per attendee, each with its own Mongo db.

.PHONY: room-up room-seed room-status room-reset-seat room-reset-all room-reset-password room-deploy-dashboard room-loadtest room-clear-runs

ROOM_SEATS ?= 40

room-up: ## Build the seat image from HEAD and create/update seat-01..seat-$(ROOM_SEATS)
	cd $(CURDIR)/deploy/room && ./room.sh secrets && ./room.sh build && ./room.sh up $(ROOM_SEATS)

room-seed: ## Seed every seat with the starter kit and write the seat directory (db room)
	cd $(CURDIR)/packages/server && npx tsx scripts/seed/workshop-room.ts seed --seats 1-$(ROOM_SEATS)

room-status: ## Health of every seat
	cd $(CURDIR)/packages/server && npx tsx scripts/seed/workshop-room.ts status --seats 1-$(ROOM_SEATS)

room-reset-seat: ## Wipe and reseed one seat, delete its account and free it: make room-reset-seat SEAT=07
ifndef SEAT
	$(error SEAT is required, e.g. SEAT=07)
endif
	cd $(CURDIR)/packages/server && npx tsx scripts/seed/workshop-room.ts reset $(SEAT)

room-reset-all: ## Before the workshop: wipe and reseed every seat, delete every account, free every seat
	cd $(CURDIR)/packages/server && npx tsx scripts/seed/workshop-room.ts reset-all --seats 1-$(ROOM_SEATS)

room-reset-password: ## Set an attendee's password: make room-reset-password EMAIL=a@b.co PASSWORD=newpass123
ifndef EMAIL
	$(error EMAIL is required)
endif
ifndef PASSWORD
	$(error PASSWORD is required)
endif
	cd $(CURDIR)/packages/server && npx tsx scripts/seed/workshop-room.ts reset-password '$(EMAIL)' '$(PASSWORD)'

room-deploy-dashboard: ## Deploy packages/dashboard as chanl-eval-lab (cloud mode)
	cd $(CURDIR)/deploy/room && ./room.sh deploy-dashboard

room-loadtest: ## Queue K runs of the Acme scenario on every seat at once: make room-loadtest K=5
	cd $(CURDIR)/packages/server && npx tsx scripts/seed/workshop-room.ts loadtest --seats 1-$(ROOM_SEATS) --k $(or $(K),5)

room-clear-runs: ## Delete rehearsal runs on every seat; RELEASE=1 also deletes accounts and frees seats
	cd $(CURDIR)/packages/server && npx tsx scripts/seed/workshop-room.ts clear-runs --seats 1-$(ROOM_SEATS) $(if $(RELEASE),--release)
