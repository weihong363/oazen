# Roadmap

## Overview

Oazen is a local memory runtime for coding agents.

It helps agents:

* recall relevant context before a task
* write back useful learnings after a task
* merge, compress, and forget memory over time
* keep memory local, inspectable, and controllable
* avoid leaking unrelated or sensitive context across projects

---

## Pipeline

```text
session log
  -> writeback
  -> sensitive screening
  -> inbox
  -> review (approve / reject)
  -> session
  -> merge
  -> compress
  -> promote
  -> fact / core
  -> recall
  -> decay / forget
```

---

## Phase 0 — Runnable Core

**Goal:** Make Oazen a working CLI.

**Includes:**

* `oazen recall <task>`
* `oazen writeback --file <path>`
* `oazen list`
* JSON storage
* basic scoring
* smoke tests

**Deliverables:**

* `src/index.ts`
* `src/core/types.ts`
* `src/storage/memory-store.ts`
* `src/commands/recall.ts`
* `src/commands/writeback.ts`
* `scripts/test-runner.sh`

---

## Phase 1 — Layered Memory

**Goal:** Introduce memory lifecycle and basic scope.

**Includes:**

* `inbox` / `session` / `fact` / `core`
* manual promotion
* inbox review
* layer-aware recall and decay
* basic `global` / `project` / `repo` fields

**Deliverables:**

* `src/commands/promote.ts`
* `src/commands/review.ts`
* memory schema update

---

## Phase 2 — Merge and Conflict Handling

**Goal:** Reduce duplicate and contradictory memory.

**Includes:**

* exact dedupe
* near-duplicate merge
* provenance retention
* conflict detection

**Deliverables:**

* `src/commands/merge.ts`
* updated writeback pipeline

---

## Phase 3 — Compression

**Goal:** Turn related memories into denser summaries.

**Includes:**

* clustering
* template-based compression
* `derivedFrom` tracking
* archive original sources
* skip `inbox` and `core`

**Deliverables:**

* `src/commands/compress.ts`
* `oazen compact`

---

## Phase 4 — Decay and Safety

**Goal:** Keep memory quality high and block sensitive content.

**Includes:**

* strength decay
* recall reinforcement
* archive thresholds
* cleanup command
* sensitive data screening
* redaction / blocking before long-term storage

**Deliverables:**

* `src/core/decay.ts`
* `src/commands/forget.ts`
* sensitive screening module
* `oazen forget`

---

## Phase 5 — Codex Adapter and Scope Hardening

**Goal:** Make Oazen useful in Codex workflows.

**Includes:**

* stable context packet output
* `AGENTS.md` / Skill integration guidance
* cwd-aware recall and writeback
* stronger project isolation

**Deliverables:**

* adapter docs (`docs/CODEX_INTEGRATION.md`)
* sample `AGENTS.md` (`AGENTS.md`)
* sample skill workflow (`docs/SKILL_WORKFLOW.md`)
* scope-aware ranking updates with regression coverage (`src/commands/recall.ts`, `test/cli-smoke.test.mjs`)

---

## Phase 5.5 — Evaluation Foundation

**Goal:** Make Oazen's value measurable with repeatable project-memory benchmarks.

**Includes:**

* stable `recall_result` JSON contract
* fixture-based benchmark runner for precision, coverage, contamination, and token savings
* benchmark-friendly source grouping under `src/`
* human-in-the-loop resume benchmark guidance

**Deliverables:**

* benchmark runner (`src/eval/run-benchmark.ts`)
* benchmark schema (`src/eval/types.ts`)
* benchmark fixtures (`fixtures/benchmark/tasks.json`)
* benchmark docs (`docs/BENCHMARKS.md`)
* regression scripts (`package.json` -> `test:benchmark`, `test:benchmark:strict`)

---

## Phase 6 — Multi-Agent Support

**Goal:** Support multiple agents without mixing memory by default.

**Includes:**

* agent identity
* private vs shared memory
* handoff memory
* adapter-specific policies

**Deliverables:**

* agent profile model
* shared/private memory policy
* multi-agent adapter layer

---

## Phase 7 — Desktop Shell

**Goal:** Provide optional visual management without making UI required.

**Includes:**

* memory list
* inbox review
* active context view
* Tauri shell

**Deliverables:**

* desktop app scaffold
* core/CLI integration with UI

---

## MVP Priority

### Must ship before public MVP

* Phase 0
* Phase 1
* Phase 2
* Phase 3
* Phase 4
* minimal Phase 5

### Nice to have for first demos

* full Phase 5
* Phase 6

### Can wait

* Phase 7
* embeddings
* LLM summarization
* cloud sync

---

## Next Build Step

### Recently Completed
1. finish `compress.ts`
2. add `forget.ts`
3. add reject flow
4. add sensitive screening before writeback
5. wire `compact` and `forget` into the CLI
6. test with real session logs
7. verify project-level scope isolation
8. ship Codex adapter docs, sample `AGENTS.md`, and sample skill workflow
9. harden machine-readable mutation contracts for `writeback` / `review` / `approve` / `reject` / `promote` / `compact` / `merge` / `forget`
10. add quality-gated Codex memory import regression flow
11. group `src` by business direction (`cli`, `commands`, `core`, `storage`, `adapters`, `eval`)
12. add stable `recall_result` contract and fixture-based benchmark runner
13. add explicit conflict detection and conflict-aware `review` / `merge` output for same-scope contradictory memories

### Immediate Next
1. keep the project in verification-first mode: `npm test`
2. keep the project in verification-first mode: `npm run test:benchmark:strict`
3. keep the project in verification-first mode: `npm run test:benchmark:codex-exported:strict`
4. keep the project in verification-first mode: `npm run test:codex-memory-import`
5. only add new product behavior when verification shows a real MVP gap or unstable workflow

### MVP Status
1. Phase 0-4 plus minimal Phase 5 are essentially done
2. the last strict MVP gap was conflict detection, and that gap is now closed
3. the evaluation layer is useful for demos and proof, but it is supporting infrastructure rather than a blocker for MVP close-out

### Phase 6 — Multi-Agent Support
1. design agent profile model with identity and preferences
2. implement private vs shared memory policy
3. build multi-agent adapter layer with scope isolation
4. add handoff memory mechanism for agent collaboration
5. create agent-specific recall and writeback policies

### Phase 7 — Desktop Shell
1. scaffold Tauri desktop app with basic window management
2. build memory list view with filtering and sorting
3. implement inbox review UI with approve/reject actions
4. create active context view showing recalled memories
5. integrate CLI commands with desktop UI backend
