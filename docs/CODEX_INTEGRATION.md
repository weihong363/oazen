# Codex Hooks Integration

This document describes the current first-class Oazen flow for Codex.

Oazen is now a hooks-driven project memory sidecar. The preferred Codex path is:

```text
Codex lifecycle event
  -> Codex hook command
  -> Oazen runtime
  -> project resolver
  -> project memory store / retriever / compactor
  -> compact hook output back to Codex
```

The older `oazen codex preload/run/interactive` commands still exist for manual debugging, benchmarks, and migration work, but they are no longer the primary integration model.

See also: [Sample Skill Workflow](SKILL_WORKFLOW.md)

---

## Install Codex Hooks

Project-scoped install:

```bash
oazen install codex --scope project
```

This creates or updates:

```text
.codex/hooks.json
```

User-scoped install:

```bash
oazen install codex --scope user
```

This writes:

```text
~/.codex/hooks.json
```

Oazen does not blindly overwrite existing hook files. If a hooks file already exists, it creates a `.bak` backup and preserves unrelated hook entries.

If your Codex build requires an explicit hooks flag, enable hooks in `~/.codex/config.toml` according to your local Codex configuration. Oazen does not mutate `config.toml`.

Uninstall project hooks:

```bash
oazen uninstall codex --scope project
```

---

## Generated Hook Entries

Project install generates these active events. The real generated commands include `OAZEN_HOME=<project>/.oazen` and call the current Oazen CLI entrypoint with an absolute Node path, so hook memory and logs stay inside the project workspace and do not depend on `oazen` being available in Codex's `PATH`.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear",
        "hooks": [
          {
            "type": "command",
            "command": "OAZEN_HOME='<project>/.oazen' '<node>' '<oazen>/dist/index.js' hook codex session-start",
            "timeout": 10,
            "statusMessage": "Loading Oazen project memory"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "OAZEN_HOME='<project>/.oazen' '<node>' '<oazen>/dist/index.js' hook codex user-prompt-submit",
            "timeout": 10,
            "statusMessage": "Retrieving Oazen context"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "OAZEN_HOME='<project>/.oazen' '<node>' '<oazen>/dist/index.js' hook codex stop",
            "timeout": 30,
            "statusMessage": "Updating Oazen memory"
          }
        ]
      }
    ]
  }
}
```

Phase 2 events are represented in the runtime model and CLI surface, but are intentionally conservative:

```bash
oazen hook codex pre-tool-use
oazen hook codex post-tool-use
oazen hook codex permission-request
```

They currently fail open and are reserved for low-noise policy hints and activity observation.

---

## Hook Commands

Each hook command:

- reads JSON from stdin
- maps the Codex payload into Oazen's normalized hook event model
- resolves the current project
- runs the Oazen runtime
- prints valid JSON
- exits `0` unless the CLI itself cannot start
- fails open by default

Smoke test:

```bash
echo '{}' | oazen hook codex session-start
```

Expected shape:

```json
{
  "continue": true,
  "decision": "none",
  "metadata": {
    "projectId": "project_...",
    "memoryFilePath": "/path/to/project/.oazen/data/project-memories.json",
    "recordsLoaded": 12,
    "projectRecordsLoaded": 7,
    "recordsRetrieved": 2,
    "injectedContextChars": 640
  }
}
```

If useful context is found, the output includes `additionalContext`.
If context is skipped, `metadata.skipReason` explains why, for example `memory_file_empty_or_missing`, `no_project_records`, or `no_relevant_project_memory`.

---

## Supported Codex Events

### SessionStart

Command:

```bash
oazen hook codex session-start
```

Behavior:

- resolves the current project
- loads project summary, stable rules, decisions, task state, known issues, TODOs, and preferences
- injects compact context only when memories exist

### UserPromptSubmit

Command:

```bash
oazen hook codex user-prompt-submit
```

Behavior:

- reads the submitted prompt from the hook payload when available
- resolves the current project
- filters by `projectId` before ranking
- injects project rules and only relevant prompt-matched memories
- avoids repeating unrelated project state every turn
- returns quiet diagnostics in `metadata` so retrieval can be debugged without noisy Codex-visible text

### Stop

Command:

```bash
oazen hook codex stop
```

Behavior:

- reads the final hook payload as the available turn state
- writes compact project-scoped memory records
- extracts task summaries, decisions, rules, issues, TODOs, and file notes heuristically
- deduplicates similar records by project and type
- does not store raw full transcripts by default
- does not block Codex in default mode

---

## Context Injection Format

Oazen injects context in this shape:

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

- no memories from other projects
- no raw transcript dumps
- no vector search in the MVP
- no cloud calls
- short bullets only
- omit context entirely when nothing useful is found

---

## Project Identity

Oazen resolves project identity from:

1. explicit `.oazen.json` or `.oazen/config.json` `projectId`
2. Git remote URL
3. Git repo root
4. absolute cwd fallback

The identity includes:

- `projectId`
- `repoRoot`
- `gitRemote`
- `currentBranch`
- `workspaceName`
- timestamps

This is the primary guard against cross-project memory pollution.

---

## Local Memory Store

Project-scoped hook memory is stored locally under:

```text
<project>/.oazen/data/project-memories.json
```

User-scoped hooks and direct CLI commands without overrides use:

```text
~/.oazen/data/project-memories.json
```

Override locations:

- `OAZEN_HOME`
- `OAZEN_DATA_DIR`
- `OAZEN_PROJECT_MEMORY_FILE`

Inspect hook memory:

```bash
oazen memory list
oazen memory show <memory-id>
oazen memory add "Always run focused tests before finishing adapter changes." --type project_rule
oazen memory compact
```

Hook memory record types:

- `project_summary`
- `project_rule`
- `decision`
- `task_summary`
- `known_issue`
- `todo`
- `user_preference`
- `file_note`

---

## Reliability and Privacy

Default behavior:

- fail open
- no network calls
- no cloud sync
- no external LLM calls
- no raw transcript persistence
- local logs only
- obvious secrets redacted from logs

Project-scoped hook logs are written to:

```text
<project>/.oazen/logs/oazen.log
```

User-scoped hooks and direct CLI commands without overrides write logs to:

```text
~/.oazen/logs/oazen.log
```

Override with:

```bash
OAZEN_LOG_FILE=/path/to/oazen.log
```

Oazen rotates local logs before appending when the current file exceeds the configured size. The current file remains `oazen.log`; archives use UTC date suffixes and retention keeps the newest files:

```bash
OAZEN_LOG_MAX_BYTES=1048576
OAZEN_LOG_RETENTION_FILES=5
```

Rotation is local-only and best-effort. If rotation fails, hooks continue and Oazen still attempts to append to the current log.

Each log line includes:

- `timestamp`: local timestamp with offset
- `timeZone`: detected IANA time zone, such as `Asia/Shanghai`

---

## Legacy Manual Commands

These commands remain available:

```bash
oazen codex preload "fix parser retries" --cwd /path/to/project
oazen codex run "fix parser retries" --cwd /path/to/project --session-file sessions/run.txt -- codex exec "{packet}\n\nTask:\n{task}"
oazen codex interactive --cwd /path/to/project --session-file sessions/interactive.txt
```

Use them for:

- debugging recall output
- benchmark comparisons
- manual memory experiments
- environments where Codex hooks are unavailable

For new product behavior, prefer hook commands and project-scoped hook memory.
