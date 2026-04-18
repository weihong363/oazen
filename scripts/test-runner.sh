#!/bin/bash

echo "===== OAZEN TEST RUNNER ====="

# Get the project root directory (parent of scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Helper function to run oazen command and get clean JSON output
run_oazen() {
  npm run dev --silent -- "$@" 2>/dev/null
}

# reset memory
echo "Reset memory..."
echo "[]" > "$PROJECT_ROOT/data/memories.json"

# ---------- BASIC TEST ----------
echo ""
echo "=== Test 1: Basic Pipeline ==="
run_oazen writeback -f ./sessions/test-basic.txt
run_oazen review

# promote first 3 items manually
IDS=$(run_oazen review | jq -r '.[0:3][]?.id' 2>/dev/null)

for id in $IDS; do
  run_oazen promote $id
  run_oazen promote $id
done

run_oazen recall "fix frontend build issue"
run_oazen list

# ---------- DUPLICATE TEST ----------
echo ""
echo "=== Test 2: Merge & Compress ==="
run_oazen writeback -f ./sessions/test-duplicate.txt

IDS=$(run_oazen review | jq -r '.[].id' 2>/dev/null)
for id in $IDS; do
  run_oazen promote $id
  run_oazen promote $id
done

echo "Before compact:"
run_oazen list

run_oazen compact

echo "After compact:"
run_oazen list

# ---------- FORGET TEST ----------
echo ""
echo "=== Test 3: Forget ==="
run_oazen forget
run_oazen list

# ---------- NOISE TEST ----------
echo ""
echo "=== Test 4: Noise Filtering ==="
run_oazen writeback -f ./sessions/test-noise.txt
run_oazen review

echo ""
echo "===== TEST COMPLETE ====="