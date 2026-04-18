import crypto from "crypto";
import { Memory } from "./types";
import { normalizeText, overlapScore } from "./utils";

export function tryMergeMemory(existing: Memory, incoming: Memory): Memory | null {
  if (existing.kind !== incoming.kind) return null;
  if (existing.scope !== incoming.scope) return null;
  if (existing.layer !== incoming.layer) return null;
  if (existing.status !== "active" || incoming.status !== "active") return null;

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
  for (let i = 0; i < memories.length; i++) {
    const merged = tryMergeMemory(memories[i], incoming);
    if (merged) {
      const copy = [...memories];
      copy[i] = merged;
      return copy;
    }
  }
  return [...memories, incoming];
}