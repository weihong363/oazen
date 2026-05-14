export type HookDecision = "allow" | "block" | "none";

export type HookResult = {
  continue: boolean;
  decision: HookDecision;
  reason?: string;
  additionalContext?: string;
  systemMessage?: string;
  metadata?: Record<string, unknown>;
};

export function allowHookResult(metadata: Record<string, unknown> = {}): HookResult {
  return {
    continue: true,
    decision: "none",
    metadata,
  };
}
