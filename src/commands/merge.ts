import crypto from "crypto";
import { detectMemoryConflicts } from "../core/conflicts";
import { buildMemoryChange, buildMutationResult } from "../core/contracts";
import { Memory, MemoryMutationResult } from "../core/types";
import { normalizeText, overlapScore } from "../core/utils";
import { withLockedMemories } from "../storage/memory-store";

export function tryMergeMemory(existing: Memory, incoming: Memory): Memory | null {
  if (existing.kind !== incoming.kind) return null;
  if (existing.scope !== incoming.scope) return null;
  if (existing.scopeKey !== incoming.scopeKey) return null;
  if (existing.layer !== incoming.layer) return null;
  if (existing.status !== "active" || incoming.status !== "active") return null;
  if (existing.reviewState !== incoming.reviewState) return null;
  if (existing.restrictedToInbox !== incoming.restrictedToInbox) return null;

  const exact =
    normalizeText(existing.content) === normalizeText(incoming.content);

  const similar =
    overlapScore(existing.title + " " + existing.content, incoming.title + " " + incoming.content) >= 0.75;

  if (!exact && !similar) return null;

  const newer = existing.updatedAt >= incoming.updatedAt ? existing : incoming;
  const older = newer === existing ? incoming : existing;

  return {
    ...newer,
    id: existing.id || crypto.randomUUID(),
    tags: [...new Set([...existing.tags, ...incoming.tags])],
    strength: Math.min(1, Math.max(existing.strength, incoming.strength) + 0.08),
    accessCount: existing.accessCount + incoming.accessCount,
    lastAccessedAt: Math.max(existing.lastAccessedAt, incoming.lastAccessedAt),
    createdAt: Math.min(existing.createdAt, incoming.createdAt),
    updatedAt: Math.max(existing.updatedAt, incoming.updatedAt),
    evidence: [existing.evidence, incoming.evidence, older.content].filter(Boolean).join(" | "),
  };
}

export function mergeIntoList(memories: Memory[], incoming: Memory): Memory[] {
  return upsertMemory(memories, incoming).memories;
}

export function upsertMemory(
  memories: Memory[],
  incoming: Memory
): { memories: Memory[]; change: { before: Memory | null; after: Memory } } {
  for (let i = 0; i < memories.length; i++) {
    const merged = tryMergeMemory(memories[i], incoming);
    if (merged) {
      const before = { ...memories[i] };
      const copy = [...memories];
      copy[i] = merged;
      return {
        memories: copy,
        change: {
          before,
          after: merged,
        },
      };
    }
  }

  return {
    memories: [...memories, incoming],
    change: {
      before: null,
      after: incoming,
    },
  };
}

export async function mergeRelatedMemories(): Promise<MemoryMutationResult> {
  return withLockedMemories(async (memories) => {
    const active = memories.filter((memory) => memory.status === "active");
    const archivedIds = new Set<string>();
    const changes = [];

    for (let i = 0; i < active.length; i++) {
      const base = active[i];
      if (archivedIds.has(base.id)) continue;

      for (let j = i + 1; j < active.length; j++) {
        const candidate = active[j];
        if (archivedIds.has(candidate.id)) continue;

        const merged = tryMergeMemory(base, candidate);
        if (!merged) continue;

        const target = memories.find((memory) => memory.id === base.id);
        const duplicate = memories.find((memory) => memory.id === candidate.id);
        if (!target || !duplicate) continue;

        const targetBefore = { ...target };
        const before = { ...duplicate };
        Object.assign(target, merged);
        changes.push(buildMemoryChange(targetBefore, target));
        duplicate.status = "archived";
        duplicate.updatedAt = Date.now();
        archivedIds.add(candidate.id);
        changes.push(buildMemoryChange(before, duplicate));
      }
    }

    return buildMutationResult("merge", changes, {
      conflicts: detectMemoryConflicts(memories),
    });
  });
}
