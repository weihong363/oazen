# Sample Skill Workflow

This file is a concrete example of how a Codex-oriented skill can use Oazen.

## Goal

Use Oazen as a narrow memory sidecar around a task:

1. recall relevant memory
2. execute the task
3. write back useful learnings
4. review and promote only when appropriate

## Example Skill Prompt

```md
# Skill: Oazen-Assisted Task Execution

Before making changes:

1. Run `oazen recall "<task>" --cwd <working-dir> --format codex`
2. Use the returned context packet as task context

After completing the task:

1. Save a short session summary to a file
2. Run `oazen writeback --file <summary-file> --cwd <working-dir>`
3. Run `oazen review`
4. Only `approve` safe inbox memories
5. `promote` only durable reviewed memories
```

## Example Session Flow

```bash
oazen recall "fix parser retries" --cwd /workspace/repo/packages/app --format codex

# ... do the implementation work ...

oazen writeback --file /tmp/oazen-session.txt --cwd /workspace/repo/packages/app
oazen review
oazen approve <safe-memory-id>
oazen promote <durable-memory-id>
```

## Adapter Notes

- `recall --format codex` is the prompt-facing renderer
- `review` returns `memory_query_result`
- `writeback`, `approve`, `reject`, `promote`, `compact`, `merge`, and `forget` return `memory_mutation_result`
- failed mutation actions return `memory_action_error` on stderr

## Scope Notes

- use the real working directory for `--cwd`
- in a monorepo, project-scoped memories should stay inside the current package
- repo memories can still be shared across sibling packages when appropriate
