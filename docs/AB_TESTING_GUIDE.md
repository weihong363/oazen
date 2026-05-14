# Oazen A/B Testing Guide

This document describes a simple way to compare **Codex with Oazen hooks** against **Codex without Oazen**.

## Goal

Measure whether Oazen helps a coding task by:

* reducing repeated context
* improving first-pass task direction
* lowering token waste
* keeping memory scoped correctly
* writing compact project memory after the task

---

## Test Setup

Use the same:

* task prompt
* project directory
* Codex command
* machine / environment
* artifact capture format

## Isolation Rules

To keep the comparison clean, do **not** let the baseline and Oazen runs share state.

Use separate:

* `OAZEN_HOME`
* worktree or repo snapshot
* output directories
* hook / memory artifacts

Recommended setup:

1. Run the baseline in a clean workspace.
2. Do not install or invoke Oazen hooks for the baseline.
3. Do not write back baseline output into the Oazen store.
4. Run the Oazen version in a separate workspace or separate worktree.
5. Give Oazen its own `OAZEN_HOME` so its memory store is isolated.

If you want the cleanest possible comparison, reset the repo state before each run and keep the task prompt identical.

---

## Commands

### Baseline run

```bash
# Use a clean workspace and a separate state directory
export OAZEN_HOME=/tmp/oazen-ab-baseline
codex "<task>" --cwd <project>
```

Or your normal Codex command for the same task.

Save the result as:

```text
baseline.log
```

### Oazen hooks run

```bash
# Use a different state directory from baseline
export OAZEN_HOME=/tmp/oazen-ab-oazen
cd <project>
oazen install codex --scope project
echo '{}' | oazen hook codex session-start
codex "<task>" --cwd <project>
```

Save the result as:

```text
oazen.log
hooks.json
hook-session-start.json
project-memories.json
```

For controlled non-interactive testing, you can invoke hook commands directly with representative payloads:

```bash
printf '{"cwd":"<project>","prompt":"<task>"}' | oazen hook codex user-prompt-submit
printf '{"cwd":"<project>","transcript":"<short final task state>"}' | oazen hook codex stop
```

If you already have two benchmark run reports, you can compare them directly:

```bash
oazen eval compare /path/to/baseline-benchmark.json /path/to/oazen-benchmark.json
```

This prints a machine-readable `benchmark_compare_result` JSON payload with:

* baseline vs Oazen primary metrics
* token savings comparison
* recall precision / coverage comparison when available
* scope contamination comparison when available
* per-task verdicts
* `null` for unavailable metrics instead of guessed values

---

## Hook-friendly execution

Codex CLI is designed for an interactive workflow. Oazen hooks should stay behind the scenes and must not make Codex feel like it is running inside a wrapper.

For Oazen, that means:

* install hooks once
* return compact JSON from each hook
* fail open if Oazen has an internal error
* inject context only through `additionalContext`
* write compact memory on `Stop`
* avoid raw transcript persistence

A good rule is:

* **front of house** = normal Codex dialogue
* **back of house** = Oazen project resolution, retrieval, and compact memory update

This keeps the agent experience responsive while still giving Oazen enough lifecycle signal to improve project memory.

### 1. Context quality

Check whether the model started with the right memory.

Look for:

* fewer repeated explanations
* fewer wrong assumptions
* better focus on the actual task
* less cross-project leakage

### 2. Task efficiency

Check whether the task moved faster.

Look for:

* faster first useful action
* fewer backtracks
* fewer clarification loops
* less time spent re-deriving known facts

### 3. Memory behavior

Check whether Oazen improved memory handling.

Look for:

* correct scope selection
* useful Stop memory update
* no sensitive content persisted
* no unrelated memory pollution

### 4. Token usage

Check whether Oazen reduced the amount of context needed.

Compare:

* raw prompt size
* hook `additionalContext` size
* selected memory count
* `savedVsBaseline`

---

## Result Checklist

For each task, record:

* task name
* project path
* baseline outcome
* Oazen outcome
* time to first useful action
* number of repeated context explanations
* relevant memory ids used or injected
* whether the Stop hook wrote useful memory
* whether any memory was blocked or redacted

---

## Suggested Log Files

Keep these files per task:

```text
baseline.log
oazen.log
hooks.json
hook-session-start.json
hook-user-prompt-submit.json
hook-stop.json
project-memories-before.json
project-memories-after.json
```

Optional extras:

```text
codex-command.txt
notes.md
```

---

## How to Read the Results

### Oazen looks better when:

* the task starts with the right project-specific context
* Codex asks fewer basic follow-up questions
* the task avoids unrelated memory from other projects
* the Stop hook writes useful compact facts
* a second run on the same task recalls better memory

### Oazen looks weaker when:

* the injected hook context is noisy
* the task still needs the same explanations as baseline
* Stop writes weak or duplicated memory
* scope isolation is wrong
* recall pulls in irrelevant items

---

## Simple Review Format

You can keep a tiny table like this for each run:

| Task                  | Baseline | Oazen  | Better?  | Notes                                    |
| --------------------- | -------- | ------ | -------- | ---------------------------------------- |
| Fix parser retry flow | 18 min   | 11 min | Yes      | Less repeated context, better scope      |
| Update project docs   | 9 min    | 8 min  | Slightly | Similar output, cleaner Stop memory |

---

## Recommended Demo Flow

1. Run the baseline task in a clean workspace.
2. Save the logs.
3. Run the same task with Oazen hooks installed in a separate workspace or worktree.
4. Compare the two outputs side by side.
5. Re-run the task once more with Oazen to check whether recall improves.

This is the easiest way to show whether Oazen actually helps the agent.

---

## Practical Tips

* Keep the task narrow.
* Use one project only.
* Do not change the prompt between baseline and Oazen runs.
* Use the same Codex mode for both runs.
* Keep one clear success criterion per test.
* Prefer repeatable tasks over one-off experiments.
* Keep baseline and Oazen output directories separate.
* Never write baseline results into the Oazen memory store.
* Keep `.codex/hooks.json` from the Oazen run out of the baseline workspace.

---

## What Good Looks Like

A good result usually means:

* Oazen injected context is concise and relevant
* Codex spends less time re-establishing context
* The task stays on the right scope
* The Stop hook writes useful durable knowledge
* The next run improves again because of hook memory

---

## Minimal Pass / Fail Rule

A task passes the Oazen test if all of the following are true:

* the injected hook context is relevant
* the Codex run stays scoped to the right project
* the Stop hook produces useful project memory
* the next recall is better than the first one

If those are not true, the test should be treated as a regression or a weak demo.
