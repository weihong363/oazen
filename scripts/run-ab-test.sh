#!/bin/bash

set -uo pipefail

TASK="${1:-}"
PROJECT_DIR="${2:-}"
TEST_DIR="${3:-}"

if [ -z "$TASK" ] || [ -z "$PROJECT_DIR" ] || [ -z "$TEST_DIR" ]; then
  echo "Usage: ./scripts/run-ab-test.sh \"<task>\" <project-dir> <test-dir>"
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "Missing required command: codex"
  exit 1
fi

PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
TEST_DIR="$(mkdir -p "$TEST_DIR" && cd "$TEST_DIR" && pwd)"

BASELINE_DIR="$TEST_DIR/baseline"
OAZEN_DIR="$TEST_DIR/oazen"
BASELINE_OAZEN_HOME="$BASELINE_DIR/oazen-home"
OAZEN_RUN_HOME="$OAZEN_DIR/oazen-home"

mkdir -p "$BASELINE_DIR" "$OAZEN_DIR" "$BASELINE_OAZEN_HOME" "$OAZEN_RUN_HOME"

printf '%s\n' "$TASK" > "$BASELINE_DIR/task.txt"
printf '%s\n' "$PROJECT_DIR" > "$BASELINE_DIR/cwd.txt"
printf '%s\n' 'codex exec "$TASK"' > "$BASELINE_DIR/codex-command.txt"

printf '%s\n' "$TASK" > "$OAZEN_DIR/task.txt"
printf '%s\n' "$PROJECT_DIR" > "$OAZEN_DIR/cwd.txt"
printf '%s\n' 'oazen codex run "$TASK" --cwd "$PROJECT_DIR" --session-file "$OAZEN_DIR/session.log" -- codex exec "{packet}\n\nTask:\n{task}"' > "$OAZEN_DIR/codex-command.txt"

echo "===== OAZEN A/B TEST ====="
echo "Task: $TASK"
echo "Project: $PROJECT_DIR"
echo "Results: $TEST_DIR"

echo ""
echo ">>> Baseline run"
BASELINE_EXIT=0
(
  cd "$PROJECT_DIR"
  export OAZEN_HOME="$BASELINE_OAZEN_HOME"
  codex exec "$TASK" 2>&1 | tee "$BASELINE_DIR/baseline.log"
) || BASELINE_EXIT=$?
printf '%s\n' "$BASELINE_EXIT" > "$BASELINE_DIR/exit-code.txt"
echo "Baseline exit code: $BASELINE_EXIT"

echo ""
echo ">>> Oazen preload"
OAZEN_PRELOAD_EXIT=0
export OAZEN_HOME="$OAZEN_RUN_HOME"
npm run dev -- codex preload "$TASK" --cwd "$PROJECT_DIR" --format json | tee "$OAZEN_DIR/preload.json" >/dev/null || OAZEN_PRELOAD_EXIT=$?
printf '%s\n' "$OAZEN_PRELOAD_EXIT" > "$OAZEN_DIR/preload-exit-code.txt"
echo "Oazen preload exit code: $OAZEN_PRELOAD_EXIT"

echo ""
echo ">>> Oazen run"
OAZEN_RUN_EXIT=0
npm run dev -- codex run "$TASK" \
  --cwd "$PROJECT_DIR" \
  --session-file "$OAZEN_DIR/session.log" \
  -- codex exec "{packet}

Task:
{task}" \
  > >(tee "$OAZEN_DIR/run.json") \
  2> >(tee "$OAZEN_DIR/live.log" >&2) || OAZEN_RUN_EXIT=$?
printf '%s\n' "$OAZEN_RUN_EXIT" > "$OAZEN_DIR/exit-code.txt"
echo "Oazen run exit code: $OAZEN_RUN_EXIT"

cat > "$TEST_DIR/ab-summary.md" <<EOF
# A/B Summary

Task: $TASK
Project: $PROJECT_DIR

## Artifacts

- Baseline log: $BASELINE_DIR/baseline.log
- Baseline exit code: $BASELINE_EXIT
- Oazen preload: $OAZEN_DIR/preload.json
- Oazen run result: $OAZEN_DIR/run.json
- Oazen live output: $OAZEN_DIR/live.log
- Oazen session log: $OAZEN_DIR/session.log
- Oazen writeback input: $OAZEN_DIR/session.log.writeback.txt
- Oazen exit code: $OAZEN_RUN_EXIT

## Verdict

- Context quality: better / neutral / worse
- Execution efficiency: better / neutral / worse
- Output quality: better / neutral / worse
- Writeback usefulness: better / neutral / worse
- Final: better / neutral / worse

## Notes

- Baseline:
- Oazen:
EOF

echo ""
echo "===== DONE ====="
echo "Baseline log: $BASELINE_DIR/baseline.log"
echo "Oazen session log: $OAZEN_DIR/session.log"
echo "Summary template: $TEST_DIR/ab-summary.md"
