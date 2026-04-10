#!/bin/bash
# chanl-eval Smoke Test
# Proves the full stack works: server → generate → list → verify data exists
#
# Prerequisites:
#   - MongoDB running on localhost:27217 (docker compose up -d)
#   - Redis running on localhost:6479 (docker compose up -d)
#   - An LLM API key in env: CHANL_OPENAI_API_KEY or CHANL_ANTHROPIC_API_KEY
#
# Usage:
#   bash scripts/smoke-test.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

BASE_URL="http://localhost:18005"
API_URL="${BASE_URL}/api/v1"
FAILED=0

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; FAILED=1; }
step() { echo -e "\n${BOLD}$1${NC}"; }

# ─── 1. Health check ──────────────────────────────────────────────────
step "1. Health Check"
HEALTH=$(curl -sf "${BASE_URL}/health" 2>/dev/null) || { fail "Server not running at ${BASE_URL}. Start with: cd packages/server && pnpm start:dev"; exit 1; }
echo "$HEALTH" | jq -e '.status == "ok"' > /dev/null 2>&1 && pass "Server healthy" || fail "Health check returned unexpected status"

# ─── 2. Generate test suite ───────────────────────────────────────────
step "2. Generate Test Suite"
GENERATE_RESULT=$(curl -sf -X POST "${API_URL}/generation/from-prompt" \
  -H "Content-Type: application/json" \
  -d '{
    "systemPrompt": "You are a helpful shoe store customer service agent. You can look up orders by order number, process returns within 30 days, check inventory for shoes by size and style, and recommend products based on customer preferences. Be friendly and professional.",
    "count": 3,
    "includeAdversarial": false
  }' 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$GENERATE_RESULT" ]; then
  fail "Generation request failed. Is an LLM API key configured? Set CHANL_OPENAI_API_KEY or CHANL_ANTHROPIC_API_KEY."
  exit 1
fi

SCENARIO_COUNT=$(echo "$GENERATE_RESULT" | jq -r '.result.scenarioIds | length')
PERSONA_COUNT=$(echo "$GENERATE_RESULT" | jq -r '.result.personaIds | length')
SCORECARD_ID=$(echo "$GENERATE_RESULT" | jq -r '.result.scorecardId // empty')
SUMMARY=$(echo "$GENERATE_RESULT" | jq -r '.result.summary // "No summary"')

[ "$SCENARIO_COUNT" -gt 0 ] 2>/dev/null && pass "Generated ${SCENARIO_COUNT} scenarios" || fail "No scenarios generated"
[ "$PERSONA_COUNT" -gt 0 ] 2>/dev/null && pass "Generated ${PERSONA_COUNT} personas" || fail "No personas generated"
[ -n "$SCORECARD_ID" ] && pass "Created scorecard: ${SCORECARD_ID}" || fail "No scorecard created"
echo -e "  ${DIM}Summary: ${SUMMARY}${NC}"

# ─── 3. Verify data in database ──────────────────────────────────────
step "3. Verify Data Persisted"

SCENARIOS=$(curl -sf "${API_URL}/scenarios?tags=auto-generated&limit=10" 2>/dev/null)
SC_COUNT=$(echo "$SCENARIOS" | jq -r '.scenarios | length')
[ "$SC_COUNT" -gt 0 ] 2>/dev/null && pass "Scenarios in database: ${SC_COUNT}" || fail "No scenarios found in database"

PERSONAS=$(curl -sf "${API_URL}/personas?limit=10" 2>/dev/null)
P_COUNT=$(echo "$PERSONAS" | jq -r '.personas | length')
[ "$P_COUNT" -gt 0 ] 2>/dev/null && pass "Personas in database: ${P_COUNT}" || fail "No personas found in database"

if [ -n "$SCORECARD_ID" ]; then
  SCORECARD=$(curl -sf "${API_URL}/scorecards/${SCORECARD_ID}" 2>/dev/null)
  SC_NAME=$(echo "$SCORECARD" | jq -r '.name // .scorecard.name // empty')
  [ -n "$SC_NAME" ] && pass "Scorecard loaded: ${SC_NAME}" || fail "Scorecard not found by ID"
fi

# ─── 4. List first generated scenario ─────────────────────────────────
step "4. Show Generated Content"
FIRST_SCENARIO=$(echo "$SCENARIOS" | jq -r '.scenarios[0]')
echo -e "  ${DIM}Scenario: $(echo "$FIRST_SCENARIO" | jq -r '.name')${NC}"
echo -e "  ${DIM}Prompt:   $(echo "$FIRST_SCENARIO" | jq -r '.prompt' | head -c 100)...${NC}"
echo -e "  ${DIM}Category: $(echo "$FIRST_SCENARIO" | jq -r '.category') | Difficulty: $(echo "$FIRST_SCENARIO" | jq -r '.difficulty')${NC}"

# ─── Result ───────────────────────────────────────────────────────────
echo ""
if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}SMOKE TEST PASSED${NC}"
  echo -e "${DIM}Dashboard: cd packages/dashboard && pnpm dev → http://localhost:3010${NC}"
  echo -e "${DIM}Navigate to /scenarios, /personas, /scorecards to see generated data${NC}"
else
  echo -e "${RED}${BOLD}SMOKE TEST FAILED${NC}"
  exit 1
fi
