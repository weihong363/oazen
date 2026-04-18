import { decayStrength } from "../core/decay";
import { buildRecallScore } from "../core/scoring";
import { inferScopeContext, memoryMatchesScope } from "../core/scope";
import { RecallResult } from "../core/types";
import { tokenize } from "../core/utils";
import { loadMemories, saveMemories } from "../storage/memory-store";

type RecallOptions = {
  cwd?: string;
  limit?: number;
  candidateLimit?: number;
  updateAccess?: boolean;
};

function estimateTextTokens(text: string): number {
  return tokenize(text).length;
}

function estimateMemoryTokens(memory: { title: string; content: string }): number {
  return estimateTextTokens(`${memory.title} ${memory.content}`);
}

export async function recall(
  task: string,
  options: RecallOptions = {}
): Promise<RecallResult> {
  const memories = await loadMemories();
  const now = Date.now();
  const scope = inferScopeContext(options.cwd);
  const limit = options.limit ?? 8;
  const candidateLimit = options.candidateLimit ?? Math.max(limit * 3, 20);
  const updateAccess = options.updateAccess ?? true;

  const approved = memories
    .filter((memory) => memory.status === "active")
    .filter((memory) => memory.reviewState === "approved")
    .map((memory) => ({ ...memory, strength: decayStrength(memory, now) }));

  const active = approved
    .filter((memory) => memory.strength > 0.08)
    .filter((memory) => memory.layer !== "inbox")
    .filter((memory) => memoryMatchesScope(memory, scope));

  const rankedAll = active
    .map((memory) => {
      const scoreBreakdown = buildRecallScore(memory, task, scope);
      return {
        memory,
        scoreBreakdown,
      };
    })
    .filter((item) => item.scoreBreakdown.total > 0)
    .sort((a, b) => b.scoreBreakdown.total - a.scoreBreakdown.total);

  const candidateItems = rankedAll.slice(0, candidateLimit);
  const selectedItems = candidateItems.slice(0, limit);
  const selectedIds = new Set(selectedItems.map((item) => item.memory.id));

  if (updateAccess) {
    for (const memory of memories) {
      if (selectedIds.has(memory.id)) {
        const selected = selectedItems.find((item) => item.memory.id === memory.id);
        if (!selected) continue;
        memory.accessCount += 1;
        memory.lastAccessedAt = now;
        memory.updatedAt = now;
        memory.strength = selected.memory.strength;
        continue;
      }

      memory.strength = decayStrength(memory, now);
      if (memory.layer === "inbox" && memory.strength < 0.05) {
        memory.status = "archived";
      }
    }

    await saveMemories(memories);
  }

  const candidates = candidateItems.map((item) => ({
    id: item.memory.id,
    title: item.memory.title,
    layer: item.memory.layer,
    kind: item.memory.kind,
    scope: item.memory.scope,
    scopeKey: item.memory.scopeKey,
    content: item.memory.content,
    score: item.scoreBreakdown.total,
    scoreBreakdown: item.scoreBreakdown,
    sensitivity: item.memory.sensitivity,
  }));

  const selected = candidates.slice(0, limit);
  const baselineTokens = approved.reduce((total, memory) => total + estimateMemoryTokens(memory), 0);
  const retrievedTokens = candidates.reduce((total, memory) => total + estimateMemoryTokens(memory), 0);
  const selectedTokens = selected.reduce((total, memory) => total + estimateMemoryTokens(memory), 0);

  return {
    version: "1",
    kind: "recall_result",
    action: "recall",
    timestamp: now,
    task,
    scope,
    counts: {
      retrieved: candidates.length,
      selected: selected.length,
    },
    tokenEstimate: {
      baseline: baselineTokens,
      retrieved: retrievedTokens,
      selected: selectedTokens,
      savedVsBaseline: Math.max(0, baselineTokens - selectedTokens),
    },
    candidates,
    selected,
    memories: selected,
    core: selected.filter((memory) => memory.layer === "core").map((memory) => memory.content),
    facts: selected
      .filter((memory) => memory.kind === "fact" || memory.kind === "decision")
      .map((memory) => memory.content),
    workflows: selected
      .filter((memory) => memory.kind === "workflow" || memory.kind === "preference")
      .map((memory) => memory.content),
    warnings: selected.filter((memory) => memory.kind === "warning").map((memory) => memory.content),
    state: selected.filter((memory) => memory.kind === "state").map((memory) => memory.content),
  };
}
