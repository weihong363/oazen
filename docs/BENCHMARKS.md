# Oazen Benchmarks

This document defines the first repeatable benchmark flow for Oazen.

## Goals

The current benchmark layer focuses on the metrics that are easy to automate and directly tied to project-scoped memory:

* Project Recall Precision
* Project Recall Coverage
* Cross-Project Contamination Rate
* Context Token Saved
* Average Context Size per Task
* Recall-to-Context Ratio

`Time to Resume` and `Rework Reduction` are intentionally kept out of the automated runner for now. They need a human-in-the-loop workflow benchmark.

## Current Runner

Run the fixture benchmark:

```bash
npm run test:benchmark
```

Run the same benchmark in strict mode:

```bash
npm run test:benchmark:strict
```

Run the more realistic Codex-exported fixture set:

```bash
npm run test:benchmark:codex-exported
npm run test:benchmark:codex-exported:strict
```

The runner lives at [src/eval/run-benchmark.ts](src/eval/run-benchmark.ts) and currently uses:

* [fixtures/benchmark/tasks.json](fixtures/benchmark/tasks.json)
* [fixtures/benchmark/codex-exported.json](fixtures/benchmark/codex-exported.json)

## Benchmark Contract

The runner prints a `benchmark_run_result` JSON payload with:

* `primaryMetrics`
* `workflowMetrics`
* `tasks[]`
* overall `passed`

Each task records:

* selected memory ids
* relevant selected ids
* cross-project selected ids
* precision
* coverage
* contamination
* token savings
* context size
* recall-to-context ratio

## Fixture Design

Each benchmark fixture contains:

* `workspaces`: repo or project-shaped directories created in a temp workspace
* `memories`: approved fixture memories with explicit scope
* `tasks`: benchmark queries with relevant ids, key ids, and per-task thresholds

This keeps the benchmark deterministic and independent from a user's live Codex memory store.

The `codex-exported` fixture is intentionally closer to a real imported-memory shape:

* more session-log style “The root cause was ...” entries
* more overlapping auth/history/render/workflow vocabulary
* tasks designed to look more like project-resume prompts than clean synthetic queries

## Strict Mode

`--strict` fails the run when any task misses its configured target thresholds:

* `minPrecision`
* `minCoverage`
* `maxContamination`
* `minTokenSaved`

This makes the benchmark suitable for regression gates.

The runner also supports:

* `--output <path>` to write the full summary report
* `--task-output-dir <dir>` to write one JSON report per task

These outputs are intended for local inspection and debugging. Do not commit them.

## Resume Benchmark

`Time to Resume` should be measured separately with a human-in-the-loop workflow:

1. Open a project after a gap.
2. Run the task once without Oazen context.
3. Run the same task with `oazen recall "<task>" --format codex`.
4. Measure time from project open to first useful action.
5. Record whether later rework happened because of missing or wrong memory.

Recommended logging fields:

* `projectId`
* `task`
* `baselineTimeToResumeMs`
* `oazenTimeToResumeMs`
* `baselineReworkEvents`
* `oazenReworkEvents`
* notes about wrong-memory contamination or missing-key-memory misses

## Next Expansions

The next benchmark improvements should be:

1. add even noisier imported-memory fixtures with borderline irrelevant same-project memories
2. export a reproducible fixture generator from isolated Codex-memory test runs
3. add a manual resume benchmark log format and report template
4. correlate benchmark misses with recall score breakdown fields
