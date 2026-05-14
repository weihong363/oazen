#!/bin/bash

TASK="$1"
CWD="${2:-$(pwd)}"

if [ -z "$TASK" ]; then
  echo "Usage: ./agent-loop.sh \"your task\" [/path/to/project]"
  exit 1
fi

echo "===== OAZEN AGENT LOOP ====="
echo "Task: $TASK"
echo "Cwd: $CWD"

TIMESTAMP=$(date +%s)
SESSION_FILE="$CWD/sessions/session-$TIMESTAMP.txt"

echo ""
echo ">>> Running preload -> Codex -> writeback"

npm run dev -- codex run "$TASK" --cwd "$CWD" --session-file "$SESSION_FILE" -- codex exec "{packet}

Task:
{task}"

echo ""
echo "Session saved to: $SESSION_FILE"
echo "===== DONE ====="
