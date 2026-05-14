# Roadmap

## Overview

Oazen is a hooks-driven project memory sidecar for coding agents.

It helps agents:

* resolve the current project
* inject only relevant project context
* write compact task memory after a turn
* keep memory local, inspectable, and controllable
* avoid leaking unrelated or sensitive context across projects

---

## Current Hooks Pipeline

```text
Codex lifecycle event
  -> oazen hook codex <event>
  -> normalized hook event
  -> OazenRuntime
  -> ProjectResolver
  -> MemoryRetriever / MemoryStore
  -> compact HookResult JSON
```

Legacy manual pipeline:

```text
recall -> execute -> writeback -> review -> approve/promote
```

The legacy pipeline remains useful for debugging and benchmarks, but hooks are now the product path.

---

## Phase 0 — Runnable Legacy Core

**Goal:** Make Oazen a working CLI.

**Status:** Done.

**Includes:**

* `oazen recall <task>`
* `oazen writeback --file <path>`
* `oazen list`
* JSON storage
* basic scoring
* smoke tests

---

## Phase 1 — Layered Memory

**Goal:** Introduce memory lifecycle and basic scope.

**Status:** Done for the legacy memory path.

**Includes:**

* `inbox` / `session` / `fact` / `core`
* manual promotion
* inbox review
* layer-aware recall and decay
* basic `global` / `project` / `repo` fields

---

## Phase 2 — Merge and Conflict Handling

**Goal:** Reduce duplicate and contradictory memory.

**Status:** Done for the legacy memory path.

**Includes:**

* exact dedupe
* near-duplicate merge
* provenance retention
* conflict detection

---

## Phase 3 — Compression

**Goal:** Turn related memories into denser summaries.

**Status:** Done for the legacy memory path.

**Includes:**

* clustering
* template-based compression
* `derivedFrom` tracking
* archive original sources
* skip `inbox` and `core`

---

## Phase 4 — Decay and Safety

**Goal:** Keep memory quality high and block sensitive content.

**Status:** Done for the legacy memory path; hook memory has basic redacted logging and dedupe but needs fuller decay.

**Includes:**

* strength decay
* recall reinforcement
* archive thresholds
* cleanup command
* sensitive data screening
* redaction / blocking before long-term storage

---

## Phase 5 — Hooks-Driven Codex MVP

**Goal:** Make Oazen useful in Codex without a wrapper command.

**Status:** In progress and runnable.

**Includes:**

* normalized hook event model
* `OazenRuntime`
* robust `ProjectResolver`
* project-scoped hook memory store
* Codex hook adapter
* `SessionStart`, `UserPromptSubmit`, and `Stop`
* install/uninstall config generator
* fail-open behavior
* local logging with secret redaction
* hook runtime tests

**Deliverables:**

* `src/runtime/OazenRuntime.ts`
* `src/runtime/HookEvent.ts`
* `src/runtime/HookResult.ts`
* `src/project/ProjectResolver.ts`
* `src/memory/MemoryStore.ts`
* `src/memory/MemoryRetriever.ts`
* `src/adapters/codex/CodexHookAdapter.ts`
* `src/adapters/codex/codexHookConfig.ts`
* `docs/CODEX_INTEGRATION.md`
* `test/hook-runtime.test.mjs`

---

## Phase 5.5 — Evaluation Foundation

**Goal:** Make Oazen's value measurable with repeatable project-memory benchmarks.

**Status:** Done for fixture recall; needs hook-aware resume benchmark examples.

**Includes:**

* stable `recall_result` JSON contract
* fixture-based benchmark runner for precision, coverage, contamination, and token savings
* benchmark-friendly source grouping under `src/`
* human-in-the-loop resume benchmark guidance
* A/B guide updated for hooks-first usage

---

## Phase 6 — Phase 2 Hooks and Policy

**Goal:** Observe tools and permissions without becoming noisy.

**Includes:**

* `PreToolUse` risk hints
* `PostToolUse` validation outcome tracking
* `PermissionRequest` policy hints
* strict mode config gates
* tests for fail-open behavior

**Non-goal:** broad command blocking by default.

---

## Phase 7 — Multi-Agent Support

**Goal:** Support multiple agents without mixing memory by default.

**Includes:**

* Claude Code adapter
* Cursor adapter
* MCP adapter
* agent identity
* private vs shared memory
* handoff memory
* adapter-specific policies

---

## Phase 8 — Optional Desktop Shell

**Goal:** Provide optional visual management without making UI required.

**Includes:**

* memory list
* inbox/review view if legacy lifecycle remains user-visible
* active context view
* local-only settings

---

## MVP Priority

### Must ship before public MVP

* stable hook install/uninstall
* robust project isolation
* reliable fail-open hook output
* compact stop-memory extraction
* memory inspection commands
* README and docs aligned to hooks-first positioning

### Nice to have for first demos

* strict mode config stub
* hook-aware benchmark logs
* better stop summarization
* PostToolUse validation tracking

### Can wait

* embeddings
* cloud sync
* external LLM summarization
* desktop UI
* heavy policy enforcement

---

## Immediate Next

1. Keep `npm test` green.
2. Keep `echo '{}' | oazen hook codex session-start` returning valid JSON.
3. Add strict project-memory migration notes if the hook store changes.
4. Add hook-aware A/B examples that do not depend on wrapper execution.
5. Harden Stop extraction with more realistic Codex hook payloads.
6. Add disabled templates for `PreToolUse`, `PostToolUse`, and `PermissionRequest` if Codex config shape needs them.

---

## What Not to Sacrifice

* no unnecessary UI
* no configuration overload
* no hidden cross-project memory injection
* no cloud dependency
* no raw transcript persistence by default
* no hook behavior that makes Codex fragile
