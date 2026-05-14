import path from "path";
import { NormalizedHookEvent, NormalizedHookEventName } from "../../runtime/HookEvent";
import { HookResult } from "../../runtime/HookResult";

export type CodexHookName =
  | "session-start"
  | "user-prompt-submit"
  | "stop"
  | "pre-tool-use"
  | "post-tool-use"
  | "permission-request";

const EVENT_NAME_MAP: Record<CodexHookName, NormalizedHookEventName> = {
  "session-start": "onSessionStart",
  "user-prompt-submit": "onUserPrompt",
  stop: "onStop",
  "pre-tool-use": "beforeToolUse",
  "post-tool-use": "afterToolUse",
  "permission-request": "onPermissionRequest",
};

function stringField(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
  }

  return undefined;
}

export function mapCodexHookPayload(
  hookName: CodexHookName,
  payload: Record<string, unknown>
): NormalizedHookEvent {
  const cwd = stringField(payload, ["cwd", "workspace", "workspacePath", "repoRoot"]) ?? process.cwd();

  return {
    name: EVENT_NAME_MAP[hookName],
    adapter: "codex",
    cwd: path.resolve(cwd),
    raw: payload,
    userPrompt: stringField(payload, ["prompt", "userPrompt", "message", "input"]),
    transcript: stringField(payload, ["transcript", "summary", "finalState", "conversation"]),
    toolName: stringField(payload, ["toolName", "tool", "command"]),
    toolInput: payload.toolInput ?? payload.input,
    toolResult: payload.toolResult ?? payload.result,
    reason: stringField(payload, ["reason", "permissionReason"]),
    timestamp: Date.now(),
  };
}

export function formatCodexHookOutput(result: HookResult): Record<string, unknown> {
  return {
    continue: result.continue,
    decision: result.decision,
    reason: result.reason,
    additionalContext: result.additionalContext,
    systemMessage: result.systemMessage,
    metadata: result.metadata ?? {},
  };
}
