# Oazen Product Spec

## 1. What Oazen Is

Oazen is a **local memory runtime for coding agents**.

Its purpose is to help coding agents remember the right things, forget the wrong things, and keep context useful over time without forcing users to manage memory manually.

Oazen is designed to be:
- local-first
- low-friction
- inspectable
- layered
- safe by default

---

## 2. Product Goal

Oazen solves a simple problem:

> Coding agents forget useful context, repeat mistakes, and mix unrelated project knowledge together.

Oazen acts as an external memory layer that can:
- recall relevant memory before a task
- write back useful learnings after a task
- merge similar memories
- compress memory into denser summaries
- decay or forget stale information

The product should feel lightweight. Users should not need to learn a complex memory system to benefit from it.

---

## 3. Current Scope

### Already in the current design
- CLI-based local memory runtime
- memory writeback from session logs
- recall before task execution
- layered memory structure
- inbox / session / fact / core lifecycle
- memory merge and deduplication
- memory compression
- memory decay and forgetting
- review / promote / reject flow
- Codex integration path through adapter-style usage

### Current philosophy
- keep the core small
- keep interaction minimal
- keep user control visible
- avoid unnecessary UI and configuration

### MVP boundary
- Phase 0-4 plus minimal Phase 5 define the practical MVP boundary
- evaluation and benchmark tooling support proof and regression, but are not themselves the product core
- after the core pipeline is stable, default to verification-first instead of broadening feature scope

---

## 4. Core Principles

### 4.1 Low cognitive load
Users should not need to understand the full memory system to use Oazen.

The default workflow should be simple:
1. recall
2. execute
3. write back
4. compress
5. forget

### 4.2 Local by default
Memory should stay local unless the user explicitly chooses otherwise.

### 4.3 Inspectable and reversible
Users should be able to inspect what was remembered, merged, compressed, promoted, or forgotten.

### 4.4 Layered memory
Not all memory has the same lifespan or reliability.

### 4.5 Controlled automation
Automation should improve quality without becoming opaque.

---

## 5. Memory Model

### 5.1 Memory layers
- **inbox**: raw extracted candidates, not yet trusted
- **session**: short-term working memory
- **fact**: stable, useful recurring knowledge
- **core**: rare, durable, high-confidence memory

### 5.2 Memory types
- preference
- fact
- workflow
- warning
- state
- decision

### 5.3 Memory lifecycle
A memory may move through this path:

`inbox -> session -> fact -> core`

Or it may be:
- rejected
- archived
- compressed into a new memory
- forgotten over time

### 5.4 Memory operations
- recall
- writeback
- merge
- compress
- promote
- reject
- forget

---

## 6. Current User Experience

Oazen should behave like a quiet background utility rather than a heavy platform.

### Desired experience
- minimal prompts
- minimal setup
- no forced learning curve
- no complex dashboards before value is visible
- memory quality improves gradually in the background

### Current preferred interaction style
- command line first
- file-driven workflows
- optional review for uncertain memory
- no unnecessary clicks or nested settings
- prefer validating the current flow over adding adjacent features once the core path is end-to-end usable

---

## 7. Future Vision

### 7.1 Multi-agent support
Oazen should eventually support multiple agents sharing or partially sharing memory.

Possible modes:
- one user, multiple agents
- one project, multiple agents
- one agent per task type
- shared memory pool with scoped access

Goals:
- avoid duplicated learning across agents
- allow different agents to benefit from the same stable facts
- keep agent-specific context separate when needed

### 7.2 Project memory isolation
Oazen should support strict boundaries between projects.

Desired behavior:
- project A memory should not leak into project B unless explicitly allowed
- repo-scoped memory should stay local to that repo
- global memory should only contain truly cross-project knowledge

Possible scopes:
- global
- project
- repo
- session
- agent

### 7.3 Sensitive information screening
Oazen should reduce the chance of storing sensitive content in memory.

Examples of content that should be blocked, masked, or downgraded:
- API keys
- tokens
- passwords
- private file paths
- personal data
- secrets in logs
- credentials embedded in prompts or session output

Possible safety behavior:
- detect and redact sensitive strings before writeback
- refuse to promote sensitive content into long-term memory
- keep sensitive snippets out of compression summaries
- allow explicit user override only when appropriate

### 7.4 Memory trust levels
Not all memory should be treated equally.

Future memory may include trust levels such as:
- unverified
- user-confirmed
- derived
- compressed
- policy-blocked

### 7.5 Smarter retrieval
Oazen should eventually support better recall ranking using:
- scope
- recency
- access frequency
- stability
- task similarity
- agent type
- project relevance

### 7.6 Hybrid memory engine
Long term, Oazen may combine:
- structured memory
- lightweight semantic retrieval
- compression summaries
- rule-based filtering
- optional model-assisted extraction

The key requirement is that the system remains understandable and controllable.

---

## 8. Non-goals

Oazen should not become:
- a full chat app
- a large agent framework
- a complex workflow builder
- a generic note-taking product
- a heavy UI-first platform
- a cloud-first memory store by default

The product should stay focused on memory quality, not interface complexity.

---

## 9. Roadmap Phases

### Phase A — Working CLI
- recall
- writeback
- list
- basic storage

### Phase B — Memory lifecycle
- inbox review
- promote / reject
- merge
- compress
- forget

### Phase C — Scope control
- global / project / repo isolation
- cwd-aware recall
- repo-aware writeback

### Phase D — Safety layer
- sensitive data masking
- policy-based screening
- safe writeback

### Phase E — Multi-agent runtime
- multiple agents
- shared memory with boundaries
- agent-specific memory profiles

### Phase F — Desktop shell
- optional UI for inspection and review
- no dependency on UI for core value

---

## 10. Success Criteria

Oazen is successful if:
- users can reuse useful context without re-explaining it
- memory quality improves over time
- unrelated projects do not pollute each other
- sensitive information is not casually stored
- users do not feel forced into a complex system
- the tool remains easy to trust and easy to inspect

---

## 11. Product Positioning

Oazen is not trying to be the biggest agent platform.

It is trying to be the quiet, reliable memory layer underneath agent workflows.

The product promise is:

> remember what matters, forget what does not, and stay out of the way.
