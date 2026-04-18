import { Memory, RecallScoreBreakdown, ScopeContext } from "./types";
import { scopeBoost } from "./scope";
import { tokenize } from "./utils";

function scoreQueryMatch(memory: Memory, taskTokens: Set<string>): number {
  let score = 0;

  for (const token of tokenize(memory.title)) {
    if (taskTokens.has(token)) score += 3;
  }

  for (const token of tokenize(memory.content)) {
    if (taskTokens.has(token)) score += 2;
  }

  for (const tag of memory.tags) {
    if (taskTokens.has(tag.toLowerCase())) score += 2;
  }

  return score;
}

function scoreLayer(memory: Memory): number {
  if (memory.layer === "core") return 4;
  if (memory.layer === "fact") return 2.5;
  if (memory.layer === "session") return 1.5;
  return 0.2;
}

function scoreKind(memory: Memory): number {
  if (memory.kind === "warning") return 1.5;
  if (memory.kind === "workflow") return 1.2;
  return 0.5;
}

function scoreStrength(memory: Memory): number {
  return memory.strength * 3;
}

export function buildRecallScore(
  memory: Memory,
  task: string,
  context: ScopeContext
): RecallScoreBreakdown {
  const taskTokens = new Set(tokenize(task));
  const queryMatch = scoreQueryMatch(memory, taskTokens);
  const scope = scopeBoost(memory, context);
  const layer = scoreLayer(memory);
  const kind = scoreKind(memory);
  const strength = scoreStrength(memory);
  const total = queryMatch + scope + layer + kind + strength;

  return {
    queryMatch,
    scope,
    layer,
    kind,
    strength,
    total,
  };
}
