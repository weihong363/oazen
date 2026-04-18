# Oazen

**A local memory runtime for coding agents.**

Oazen helps coding agents remember the right things, forget the wrong things, and keep context useful over time.

It is designed to be:

* local-first
* low-friction
* layered
* inspectable
* safe by default

---

## Why Oazen

Coding agents often:

* forget useful context
* repeat mistakes
* mix unrelated project knowledge together
* make it hard to manage long-term memory cleanly

Oazen acts as an external memory layer that can:

* recall relevant memory before a task
* write back useful learnings after a task
* merge similar memories
* compress memory into denser summaries
* decay or forget stale information

---

## Current Features

* CLI-based local memory runtime
* memory writeback from session logs
* recall before task execution
* scope-aware recall and writeback
* layered memory structure
* inbox / session / fact / core lifecycle
* memory merge and deduplication
* memory compression
* memory decay and forgetting
* review / promote / reject flow
* sensitive-data screening before persistence
* adapter-style integration path for coding agents

---

## Minimal Workflow

```bash
oazen recall "fix parser retries" --format codex
oazen writeback --file sessions/run.txt --cwd /path/to/project
oazen review
oazen approve <memory-id>
oazen promote <memory-id>
```

Writeback scope defaults to `auto`, which resolves from the working directory:

* `project`: nearest `package.json`
* `repo`: nearest `.git`
* `global`: fallback when no project/repo root is found

---

## Memory Model

Oazen uses a layered memory system:

* **inbox**: raw extracted candidates, not yet trusted
* **session**: short-term working memory
* **fact**: stable and reusable knowledge
* **core**: rare, durable, high-confidence memory

Memories can move through this lifecycle:

`inbox -> session -> fact -> core`

Or they can be:

* rejected
* archived
* compressed into a new memory
* forgotten over time

---

## Roadmap

### 0–6 months

Make Oazen reliable:

* stabilize the CLI
* finish recall / writeback / review / promote / reject
* add merge, compress, forget
* support global / project / repo scope
* ship the first Codex adapter workflow

### 6–12 months

Make Oazen multi-agent aware:

* agent identity
* shared vs private memory
* handoff memory
* adapters for Codex, Claude Code, and more

### 12–24 months

Make Oazen safe at scale:

* sensitive information masking
* project isolation
* conflict detection
* trust levels
* better recall ranking

### Beyond

Evolve Oazen into a reusable memory runtime platform:

* richer adapters
* optional desktop shell
* agent-driven UI support
* advanced compression
* optional semantic retrieval

---

## Principles

* Keep the core small.
* Keep interaction minimal.
* Keep memory inspectable.
* Keep project boundaries clear.
* Keep sensitive data protected.
* Avoid unnecessary UI and configuration.

---

## Vision

Oazen is not trying to be a giant agent platform.

It is trying to be the quiet, reliable memory layer underneath agent workflows.

> remember what matters, forget what does not, and stay out of the way.
