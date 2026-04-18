# Codex Adapter Workflow

This document describes the stable Oazen flow for Codex-style agents.

See also: [Sample Skill Workflow](SKILL_WORKFLOW.md)

## Recall Output

`oazen recall "<task>"` returns a `recall_result` JSON payload with:

- `kind: "recall_result"`
- `action: "recall"`
- `version`
- `timestamp`
- `task`
- `scope`
- `counts`
- `tokenEstimate`
- `candidates`
- `selected`
- `memories`
- grouped arrays: `core`, `facts`, `workflows`, `warnings`, `state`

`oazen recall "<task>" --format codex` returns a text packet intended for direct prompt injection.

## Context Packet Contract

Each recalled memory includes:

- `id`
- `title`
- `layer`
- `kind`
- `scope`
- `scopeKey`
- `content`
- `score`
- `scoreBreakdown`
- `sensitivity`

This contract is stable enough for Codex adapters to consume directly.

## Mutation Contract

`review` returns:

- `version`
- `kind: "memory_query_result"`
- `action: "review"`
- `timestamp`
- `counts`
- `items`

Each `items[]` entry is a stable `MemorySummary` with:

- `id`
- `layer`
- `kind`
- `scope`
- `scopeKey`
- `title`
- `content`
- `status`
- `reviewState`
- `sensitivity`
- `restrictedToInbox`
- `strength`
- `updatedAt`

`writeback`, `approve`, `reject`, `promote`, `compact`, `merge`, and `forget` return:

- `version`
- `kind: "memory_mutation_result"`
- `action`
- `timestamp`
- `counts`
- `changes`

`writeback` also includes:

- `scope`
- `blocked`

Each `changes[]` entry contains:

- `before`
- `after`

Both `before` and `after` use the same `MemorySummary` shape. For create-like changes, `before` is `null`.

When one of these commands fails, stderr returns:

- `version`
- `kind: "memory_action_error"`
- `action`
- `timestamp`
- `error.message`

## Standard Usage Flow

1. Recall:

   `oazen recall "fix parser retries" --cwd /path/to/project --format codex`

2. Execute:

   Use the returned packet as pre-task context.

3. Write back:

   `oazen writeback --file /path/to/session.log --cwd /path/to/project`

4. Review:

   `oazen review`

5. Approve safe inbox items:

   `oazen approve <memory-id>`

6. Promote reviewed durable items:

   `oazen promote <memory-id>`

For adapters, treat `review.items` as the candidate queue and `mutation.changes` as the authoritative state transition log.
For `writeback`, use `counts.created`, `counts.blocked`, `scope`, and `blocked[]` for ingestion bookkeeping.
For `recall`, treat `selected[]` as the canonical injected context, `candidates[]` as the retrieval pool, and `tokenEstimate` as the context-size metric source.

## Lifecycle Constraints

- `writeback` creates `inbox` memories with `pending` review
- `approve` moves safe `inbox` memories to `session`
- `promote` moves `session -> fact -> core`
- `reject` marks a memory rejected and removes it from active recall
- `merge` only merges compatible active memories with the same scope identity
- `compact` only compresses approved non-inbox, non-core memories
- `forget` archives weak active memories over time

## Safety Constraints

- blocked secrets never persist
- redacted privacy-heavy content stays inbox-only
- inbox-only sensitive memories cannot be approved or promoted
