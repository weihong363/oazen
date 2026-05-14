import { CodexHookName, formatCodexHookOutput, mapCodexHookPayload } from "../adapters/codex/CodexHookAdapter";
import { OazenRuntime } from "../runtime/OazenRuntime";
import { HookResult } from "../runtime/HookResult";
import { logOazenEvent } from "../utils/logger";
import { parseJsonObject, readStdin } from "../utils/safeJson";

const HOOK_NAMES = new Set<CodexHookName>([
  "session-start",
  "user-prompt-submit",
  "stop",
  "pre-tool-use",
  "post-tool-use",
  "permission-request",
]);

function failOpenResult(error?: unknown): HookResult {
  return {
    continue: true,
    decision: "none",
    metadata: {
      failOpen: true,
      error: error instanceof Error ? error.message : error ? String(error) : undefined,
    },
  };
}

export function parseCodexHookName(value: string): CodexHookName {
  if (!HOOK_NAMES.has(value as CodexHookName)) {
    throw new Error(`Unsupported Codex hook event: ${value}`);
  }

  return value as CodexHookName;
}

export async function runCodexHookCommand(hookName: CodexHookName): Promise<void> {
  try {
    const raw = await readStdin();
    const payload = parseJsonObject(raw);
    const event = mapCodexHookPayload(hookName, payload);
    const runtime = new OazenRuntime();
    const result = await dispatchHook(runtime, hookName, event);
    console.log(JSON.stringify(formatCodexHookOutput(result)));
  } catch (error) {
    await logOazenEvent({
      event: `codex:${hookName}`,
      error: error instanceof Error ? error.message : String(error),
      failOpen: true,
    }).catch(() => undefined);
    console.log(JSON.stringify(formatCodexHookOutput(failOpenResult(error))));
  }
}

async function dispatchHook(
  runtime: OazenRuntime,
  hookName: CodexHookName,
  event: ReturnType<typeof mapCodexHookPayload>
): Promise<HookResult> {
  if (hookName === "session-start") return runtime.handleSessionStart(event);
  if (hookName === "user-prompt-submit") return runtime.handleUserPrompt(event);
  if (hookName === "stop") return runtime.handleStop(event);
  if (hookName === "pre-tool-use") return runtime.handlePreToolUse(event);
  if (hookName === "post-tool-use") return runtime.handlePostToolUse(event);
  return runtime.handlePermissionRequest(event);
}
