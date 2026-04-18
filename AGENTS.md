# Oazen Codex Integration

Oazen is intended to be used as a local memory sidecar for coding agents.

## Recommended Flow

1. `oazen recall "<task>" --format codex`
2. Execute the task with the recalled context.
3. `oazen writeback --file <session-log> --cwd <working-dir>`
4. `oazen review`
5. `oazen approve <id>` for safe inbox items.
6. `oazen promote <id>` when a reviewed memory becomes durable.

`review` returns a `memory_query_result`.
`writeback`, `approve`, `reject`, `promote`, `compact`, `merge`, and `forget` return a `memory_mutation_result`.
Failures for these actions return a `memory_action_error` on stderr.

## Scope Rules

- `global`: reusable everywhere
- `project`: nearest `package.json` root from the working directory
- `repo`: nearest `.git` root from the working directory

By default, writeback uses `auto`, which prefers `project`, then `repo`, then `global`.

## Safety Rules

- obvious secrets are blocked before persistence
- privacy-heavy content is redacted and restricted to `inbox`
- `approve` and `promote` refuse inbox-only sensitive memories

## Codex Packet

Use `oazen recall "<task>" --format codex` to get a stable packet:

```text
<OAZEN_CONTEXT_PACKET version="1">
...
</OAZEN_CONTEXT_PACKET>
```
