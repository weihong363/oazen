# Sample Skill Workflow

This file is a concrete example of how a Codex-oriented skill should use Oazen after the hooks refactor.

## Goal

Use Oazen as a quiet project memory sidecar:

1. install hooks once per project or user
2. let Codex lifecycle hooks inject relevant context
3. let `Stop` write compact project memory
4. inspect or add memory manually only when needed

The old manual `recall -> execute -> writeback` loop is still useful for debugging, but it should not be the default skill workflow.

---

## Example Skill Prompt

```md
# Skill: Oazen-Assisted Task Execution

Before work starts:

1. Assume Oazen project hooks may already be installed.
2. Do not manually run recall unless the user asks for debugging or the hook path is unavailable.
3. Use the injected `OAZEN PROJECT CONTEXT` when it appears.

During work:

1. Keep edits scoped to the resolved project.
2. Prefer focused validation commands.
3. Avoid adding unrelated project details to memory manually.

After completing the task:

1. Let the Codex `Stop` hook update Oazen memory.
2. If needed, inspect memory with `oazen memory list`.
3. Add explicit durable facts with `oazen memory add "<fact>" --type <type>` only when the hook input missed them.
```

---

## Setup Flow

Project install:

```bash
oazen install codex --scope project
```

Smoke test:

```bash
echo '{}' | oazen hook codex session-start
```

Disable hooks:

```bash
oazen uninstall codex --scope project
```

---

## Manual Memory Inspection

```bash
oazen memory list --cwd /workspace/repo/packages/app
oazen memory show <memory-id>
oazen memory add "Always run adapter hook tests before finishing Codex hook changes." --cwd /workspace/repo/packages/app --type project_rule
oazen memory compact --cwd /workspace/repo/packages/app
```

For first-time setup from existing local Codex memories:

```bash
oazen import codex --scope project --cwd /workspace/repo/packages/app --dry-run
oazen import codex --scope project --cwd /workspace/repo/packages/app
```

Review the dry-run first. Oazen should only import current-project candidates and should not copy the whole Codex memory pool into project memory.

## Adapter Notes

- `hook codex session-start` is the startup/resume context path.
- `hook codex user-prompt-submit` is the prompt-relevant context path.
- `hook codex stop` is the compact writeback path.
- Hook commands return valid JSON and fail open by default.
- `additionalContext` is optional and should be absent when no useful project context exists.
- The injected text uses the `OAZEN PROJECT CONTEXT` format.

## Scope Notes

- Use the real working directory when invoking manual memory commands.
- In a monorepo, explicit `projectId` can be configured with `.oazen.json` or `.oazen/config.json`.
- Hook memory must never mix project A records into project B retrieval.

## Legacy Debug Flow

Use this only when hooks are unavailable or when debugging old recall behavior:

```bash
oazen recall "fix parser retries" --cwd /workspace/repo/packages/app --format codex
oazen writeback --file /tmp/oazen-session.txt --cwd /workspace/repo/packages/app
oazen review
oazen approve <safe-memory-id>
oazen promote <durable-memory-id>
```
