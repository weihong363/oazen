# Oazen Product Spec

## 1. What Oazen Is

Oazen is a **hooks-driven project memory sidecar for AI coding agents**.

Its purpose is to help Codex, Claude Code, Cursor, and future coding agents remember the right project context without turning memory into a global blob.

Oazen is designed to be:

- local-first
- project-scoped
- hooks-driven
- adapter-friendly
- inspectable
- safe by default

Oazen is not:

- a replacement for Codex, Claude Code, or Cursor
- a general chatbot
- a heavy governance platform
- a cloud-first memory service
- a global memory pool shared across all projects

---

## 2. Product Goal

Oazen solves a simple problem:

> Coding agents forget useful project context, repeat explanations, and sometimes mix unrelated project knowledge together.

Oazen acts as a local sidecar that can:

- resolve the current project
- retrieve only relevant project memory
- inject compact context through agent lifecycle hooks
- summarize turn outcomes through stop hooks
- store durable project facts locally
- provide lightweight policy hints without becoming noisy

The product should feel like infrastructure under the agent, not a second assistant users must manage.

---

## 3. Current Scope

### Already in the current design

- Codex hook adapter for `SessionStart`, `UserPromptSubmit`, and `Stop`
- normalized internal hook event model
- project resolver with Git and cwd fallback
- local JSON project memory store
- project-scoped retrieval with strict context budgets
- compact `OAZEN PROJECT CONTEXT` injection format
- hook config install/uninstall commands
- fail-open behavior by default
- local logs with secret redaction
- manual memory inspection and add/compact commands
- legacy recall/writeback lifecycle for debugging and benchmark support

### Current philosophy

- hooks first
- keep the core small
- fail open unless strict mode is explicitly configured later
- avoid cloud sync and external LLM calls in the MVP
- preserve project boundaries before improving recall cleverness
- prefer deterministic heuristics over hidden automation

### MVP boundary

The MVP is Codex-first, but not Codex-only:

- Codex adapter is implemented first.
- Claude Code, Cursor, and MCP adapters should map into the same normalized hook model later.
- Vector search, cloud sync, UI, and external summarization are out of scope for the first pass.

---

## 4. Core Architecture

```text
Agent lifecycle event
  -> hook adapter
  -> Oazen runtime
  -> project resolver
  -> memory retriever / policy engine / summarizer
  -> hook output back to the agent
```

Internal normalized events:

- `onSessionStart`
- `onUserPrompt`
- `beforeToolUse`
- `afterToolUse`
- `onPermissionRequest`
- `onStop`
- `onMemoryCompact`
- `onSessionEnd`

Codex maps its hook payloads into these events. Later adapters should do the same instead of duplicating runtime behavior.

---

## 5. Core Principles

### 5.1 Low cognitive load

Users should install hooks once and then mostly ignore Oazen.

### 5.2 Local by default

Memory should stay local unless the user explicitly chooses otherwise.

### 5.3 Project isolation first

Project A memory must not appear in Project B context.

### 5.4 Inspectable and reversible

Users should be able to inspect what Oazen stored and remove or compact it later.

### 5.5 Controlled automation

Automation should improve the coding flow without blocking normal agent work.

### 5.6 Fail open

Hook failure should not make the coding agent fragile.

---

## 6. Project Identity

Project identity should be stable enough to avoid cross-project pollution.

Recommended identity fields:

- `projectId`
- `repoRoot`
- `gitRemote`
- `currentBranch`
- `workspaceName`
- `createdAt`
- `updatedAt`

Resolution order:

1. explicit Oazen project ID from config
2. Git remote URL
3. Git repo root
4. absolute cwd fallback

If no Git repo exists, cwd-based project identity is acceptable.

---

## 7. Memory Model

### 7.1 Hook memory record types

- `project_summary`
- `project_rule`
- `decision`
- `task_summary`
- `known_issue`
- `todo`
- `user_preference`
- `file_note`

### 7.2 Required record fields

- `id`
- `projectId`
- `type`
- `content`
- `source`
- `confidence`
- `createdAt`
- `updatedAt`
- `lastAccessedAt`
- `tags`
- `relatedFiles`
- `branch`
- optional TTL or decay metadata

### 7.3 Storage

MVP storage can be JSON. SQLite is preferred later if concurrency or query complexity demands it.

Project-scoped Codex hook memory location:

```text
<project>/.oazen/data/project-memories.json
```

User-scoped hooks and direct CLI commands without overrides use:

```text
~/.oazen/data/project-memories.json
```

Log records should use the user's local wall-clock time:

- `timestamp`: local timestamp with offset
- `timeZone`: IANA time zone from the runtime environment

Raw full transcripts should not be stored by default.

---

## 8. Runtime Behavior

### 8.1 SessionStart

- resolve current project
- load project summary, rules, decisions, recent task state, known issues, TODOs, and preferences
- return concise additional context

### 8.2 UserPromptSubmit

- read the user prompt from hook input
- resolve current project
- retrieve relevant project memories
- avoid injecting unrelated or excessive context
- return quiet diagnostics in hook metadata: project ID, memory file path, loaded count, retrieved count, injected chars, and skip reason

### 8.3 Stop

- capture available final turn state from hook input
- extract compact task summary
- extract durable facts, decisions, rules, issues, and TODOs
- deduplicate similar memory
- write locally
- avoid blocking the agent unless strict mode later enables it

### 8.4 Phase 2 Hooks

`PreToolUse`, `PostToolUse`, and `PermissionRequest` should remain low-noise:

- detect obvious risk only
- fail open by default
- provide hints rather than enforcement unless strict mode is configured

---

## 9. Context Injection

Use this compact format:

```text
OAZEN PROJECT CONTEXT
- Project:
- Current branch:
Stable rules:
- ...
Relevant decisions:
- ...
Recent task state:
- ...
Known constraints:
- ...
Suggested validation:
- ...
```

Rules:

- no unrelated memories
- no cross-project memory leakage
- no stale memory unless marked historical
- short bullets
- no repeated context when nothing relevant changed

---

## 10. CLI Surface

Primary hook commands:

```bash
oazen hook codex session-start
oazen hook codex user-prompt-submit
oazen hook codex stop
oazen hook codex pre-tool-use
oazen hook codex post-tool-use
oazen hook codex permission-request
```

Install commands:

```bash
oazen install codex --scope project
oazen install codex --scope user
oazen uninstall codex --scope project
oazen uninstall codex --scope user
```

Memory commands:

```bash
oazen memory list
oazen memory show <id>
oazen memory add "<content>" --type project_rule
oazen memory compact
```

Debug and legacy commands remain available:

```bash
oazen recall
oazen writeback
oazen review
oazen approve
oazen promote
oazen codex preload
oazen codex run
```

---

## 11. Safety and Privacy

Default behavior:

- no network calls
- no cloud sync
- no external LLM calls
- no raw transcript persistence
- obvious secrets redacted from logs
- hook errors fail open

Strict mode may later enable:

- blocking risky commands
- requiring tests before stop
- requiring memory update before stop
- blocking cross-project memory injection

Strict mode must be explicit and off by default.

---

## 12. Roadmap Phases

### Phase A — Hooks-first Codex MVP

- project resolver
- local hook memory store
- Codex hook adapter
- install/uninstall config generator
- fail-open runtime
- core tests

### Phase B — Retrieval and compaction hardening

- better dedupe
- decay / TTL
- compact project summaries
- relevance scoring improvements

### Phase C — Phase 2 hooks

- low-noise tool observation
- validation outcome tracking
- permission request hints
- strict mode config gates

### Phase D — Multi-agent adapters

- Claude Code adapter
- Cursor adapter
- MCP adapter
- agent-specific policies

### Phase E — Optional UI and richer storage

- optional inspection UI
- SQLite migration if needed
- import/export tooling

---

## 13. Success Criteria

Oazen is successful if:

- users can resume project work without repeating basic context
- injected context is compact and relevant
- memories from unrelated projects never appear
- hook failures do not break agent workflows
- useful durable facts are stored without raw transcript bloat
- privacy guarantees remain simple and true
- users can inspect and disable the system easily

---

## 14. Product Positioning

Oazen is not trying to be the biggest agent platform.

It is trying to be the quiet, reliable project memory layer underneath agent workflows.

The product promise is:

> remember what matters for this project, forget what does not, and stay out of the way.
