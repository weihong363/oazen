#!/bin/bash

TASK="$1"

if [ -z "$TASK" ]; then
  echo "Usage: ./agent-loop.sh \"your task\""
  exit 1
fi

echo "===== OAZEN AGENT LOOP ====="
echo "Task: $TASK"

TIMESTAMP=$(date +%s)
SESSION_FILE="./sessions/session-$TIMESTAMP.txt"

# 1. Recall memory
echo ""
echo ">>> Step 1: Recall memory"
MEMORY=$(npm run dev -- recall "$TASK")

echo "$MEMORY" > /tmp/oazen-memory.json

# 2. Build prompt
echo ""
echo ">>> Step 2: Build prompt"

PROMPT=$(cat <<EOF
You are a coding agent working on a real project.

Here is useful memory from previous sessions:

$MEMORY

---

Task:
$TASK

---

Rules:
- follow existing workflows if provided
- respect warnings strictly
- avoid repeating known mistakes
- explain briefly what you changed

Proceed with solving the task.
EOF
)

# 3. Run Codex
echo ""
echo ">>> Step 3: Run Codex"

OUTPUT=$(codex exec "$PROMPT")

echo "$OUTPUT" | tee "$SESSION_FILE"

# 4. Writeback memory
echo ""
echo ">>> Step 4: Writeback"

npm run dev -- writeback -f "$SESSION_FILE"

# 5. Compact (compression)
echo ""
echo ">>> Step 5: Compress"

npm run dev -- compact

# 6. Forget
echo ""
echo ">>> Step 6: Forget"

npm run dev -- forget

echo ""
echo "Session saved to: $SESSION_FILE"
echo "===== DONE ====="