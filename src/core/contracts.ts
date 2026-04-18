import {
  CliActionError,
  Memory,
  MemoryChange,
  MemoryConflict,
  MemoryMutationAction,
  MemoryMutationResult,
  MemoryQueryResult,
  MemorySummary,
} from "./types";

function buildConflictMap(conflicts: MemoryConflict[]): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const conflict of conflicts) {
    const [leftId, rightId] = conflict.memoryIds;
    map.set(leftId, [...(map.get(leftId) ?? []), rightId]);
    map.set(rightId, [...(map.get(rightId) ?? []), leftId]);
  }

  return map;
}

export function summarizeMemory(
  memory: Memory,
  extras: { conflictsWith?: string[] } = {}
): MemorySummary {
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
    conflictsWith: extras.conflictsWith,
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
  const conflicts: MemoryConflict[] = [];
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
      conflicts: conflicts.length,
    },
    items: memories.map((memory) => summarizeMemory(memory)),
    conflicts,
  };
}

export function buildMutationResult(
  action: MemoryMutationAction,
  changes: MemoryChange[],
  extras: Pick<MemoryMutationResult, "scope" | "blocked" | "conflicts"> = {}
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

export function buildConflictAwareReviewResult(
  memories: Memory[],
  conflicts: MemoryConflict[]
): MemoryQueryResult {
  const conflictMap = buildConflictMap(conflicts);

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
      conflicts: conflicts.length,
    },
    items: memories.map((memory) =>
      summarizeMemory(memory, { conflictsWith: conflictMap.get(memory.id) })
    ),
    conflicts,
  };
}
