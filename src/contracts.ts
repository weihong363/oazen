import {
  CliActionError,
  Memory,
  MemoryChange,
  MemoryMutationAction,
  MemoryMutationResult,
  MemoryQueryResult,
  MemorySummary,
} from "./types";

export function summarizeMemory(memory: Memory): MemorySummary {
  return {
    id: memory.id,
    layer: memory.layer,
    kind: memory.kind,
    scope: memory.scope,
    scopeKey: memory.scopeKey,
    title: memory.title,
    content: memory.content,
    status: memory.status,
    reviewState: memory.reviewState,
    sensitivity: memory.sensitivity,
    restrictedToInbox: memory.restrictedToInbox,
    strength: memory.strength,
    updatedAt: memory.updatedAt,
  };
}

export function buildMemoryChange(before: Memory, after: Memory): MemoryChange {
  return {
    before: summarizeMemory(before),
    after: summarizeMemory(after),
  };
}

export function buildCreationChange(after: Memory): MemoryChange {
  return {
    before: null,
    after: summarizeMemory(after),
  };
}

export function buildReviewResult(memories: Memory[]): MemoryQueryResult {
  return {
    version: "1",
    kind: "memory_query_result",
    action: "review",
    timestamp: Date.now(),
    counts: {
      total: memories.length,
      safe: memories.filter((memory) => memory.sensitivity === "safe").length,
      review: memories.filter((memory) => memory.sensitivity === "review").length,
      restricted: memories.filter((memory) => memory.restrictedToInbox).length,
    },
    items: memories.map(summarizeMemory),
  };
}

export function buildMutationResult(
  action: MemoryMutationAction,
  changes: MemoryChange[],
  extras: Pick<MemoryMutationResult, "scope" | "blocked"> = {}
): MemoryMutationResult {
  return {
    version: "1",
    kind: "memory_mutation_result",
    action,
    timestamp: Date.now(),
    counts: {
      matched: changes.length,
      changed: changes.length,
      created: changes.filter((change) => !change.before && !!change.after).length,
      archived: changes.filter((change) => change.after?.status === "archived").length,
      rejected: changes.filter((change) => change.after?.status === "rejected").length,
      blocked: extras.blocked?.length ?? 0,
    },
    changes,
    ...extras,
  };
}

export function buildCliActionError(action: string, error: unknown): CliActionError {
  return {
    version: "1",
    kind: "memory_action_error",
    action,
    timestamp: Date.now(),
    error: {
      message: error instanceof Error ? error.message : String(error),
    },
  };
}
