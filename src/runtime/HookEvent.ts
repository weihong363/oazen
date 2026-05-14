export type NormalizedHookEventName =
  | "onSessionStart"
  | "onUserPrompt"
  | "beforeToolUse"
  | "afterToolUse"
  | "onPermissionRequest"
  | "onStop"
  | "onMemoryCompact"
  | "onSessionEnd";

export type NormalizedHookEvent = {
  name: NormalizedHookEventName;
  adapter: "codex" | "claude" | "cursor" | "mcp" | "unknown";
  cwd: string;
  raw: Record<string, unknown>;
  userPrompt?: string;
  transcript?: string;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: unknown;
  reason?: string;
  timestamp: number;
};
