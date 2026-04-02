#!/usr/bin/env bash
# Take 16:9 high-res screenshots for README
# Usage: ./scripts/take-screenshots.sh [base_url]

BASE="${1:-http://localhost:3010}"
OUT="docs/screenshots"
WIDTH=1920
HEIGHT=1080
WAIT=3000

mkdir -p "$OUT"

echo "Taking screenshots at ${WIDTH}x${HEIGHT} from $BASE..."

# API base — derive from dashboard URL (default: localhost:18005)
API="${CHANL_EVAL_API:-http://localhost:18005/api/v1}"

# Get dynamic IDs for detail pages
TOOL_ID=$(curl -s "$API/tool-fixtures" 2>/dev/null | python3 -c "import sys,json; tfs=json.load(sys.stdin).get('toolFixtures',[]); print(tfs[0]['id'] if tfs else '')" 2>/dev/null || echo "")
EXEC_ID=$(curl -s "$API/scenarios/executions?limit=10" 2>/dev/null | python3 -c "
import sys,json
exs=json.load(sys.stdin).get('executions',[])
best=[e for e in exs if e.get('status')=='completed' and e.get('overallScore')]
print(max(best, key=lambda e: e['overallScore'])['id'] if best else (exs[0]['id'] if exs else ''))
" 2>/dev/null || echo "")
SCORECARD_ID=$(curl -s "$API/scorecards" 2>/dev/null | python3 -c "import sys,json; scs=json.load(sys.stdin).get('scorecards',[]); print(scs[0]['id'] if scs else '')" 2>/dev/null || echo "")

take_shot() {
  local name="$1" url="$2"
  npx playwright screenshot \
    --viewport-size="${WIDTH},${HEIGHT}" \
    --wait-for-timeout="$WAIT" \
    "$url" "$OUT/${name}.png" 2>/dev/null
  echo "  ✓ ${name}.png"
}

take_shot "01-getting-started"    "$BASE/"
take_shot "02-playground"         "$BASE/playground"
take_shot "03-scenarios"          "$BASE/scenarios"
take_shot "04-personas"           "$BASE/personas"
take_shot "05-runs"               "$BASE/executions"
take_shot "06-scorecards"         "$BASE/scorecards"
take_shot "07-tool-fixtures"      "$BASE/tool-fixtures"
take_shot "08-settings"           "$BASE/settings"

[ -n "$EXEC_ID" ] && take_shot "09-execution-detail" "$BASE/executions/$EXEC_ID"
[ -n "$TOOL_ID" ] && take_shot "10-tool-fixture-detail" "$BASE/tool-fixtures/$TOOL_ID"
[ -n "$SCORECARD_ID" ] && take_shot "11-scorecard-detail" "$BASE/scorecards/$SCORECARD_ID"

# Generate hero GIF (playground → execution → scorecard → home, 3s each)
echo ""
echo "Generating hero.gif..."
if command -v ffmpeg &>/dev/null; then
  ffmpeg -y \
    -loop 1 -t 3 -i "$OUT/02-playground.png" \
    -loop 1 -t 3 -i "$OUT/09-execution-detail.png" \
    -loop 1 -t 3 -i "$OUT/11-scorecard-detail.png" \
    -loop 1 -t 3 -i "$OUT/01-getting-started.png" \
    -filter_complex "[0]scale=960:540[s0];[1]scale=960:540[s1];[2]scale=960:540[s2];[3]scale=960:540[s3];[s0][s1][s2][s3]concat=n=4:v=1:a=0,split[x][y];[x]palettegen=max_colors=128[p];[y][p]paletteuse=dither=bayer:bayer_scale=3[out]" \
    -map "[out]" -loop 0 "$OUT/hero.gif" 2>/dev/null
  echo "  ✓ hero.gif ($(du -h "$OUT/hero.gif" | cut -f1))"
else
  echo "  ⚠ ffmpeg not found — skipping hero.gif"
fi

echo ""
echo "Done! Screenshots in $OUT/"
ls -lh "$OUT/"
