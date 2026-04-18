import crypto from "crypto";
import { buildCreationChange, buildMemoryChange, buildMutationResult } from "../core/contracts";
import { Memory, MemoryMutationResult } from "../core/types";
import { overlapScore } from "../core/utils";
import { withLockedMemories } from "../storage/memory-store";

function kindCompatible(a: Memory, b: Memory): boolean {
  if (a.kind === b.kind) return true;

  const workflowFamily = ["workflow", "preference"];
  if (workflowFamily.includes(a.kind) && workflowFamily.includes(b.kind)) {
    return true;
  }

  return false;
}

function canCompress(a: Memory, b: Memory): boolean {
  if (a.id === b.id) return false;
  if (a.status !== "active" || b.status !== "active") return false;
  if (a.layer !== b.layer) return false;
  if (a.scope !== b.scope) return false;
  if (a.scopeKey !== b.scopeKey) return false;
  if (a.layer === "inbox" || a.layer === "core") return false;
  if (a.reviewState !== "approved" || b.reviewState !== "approved") return false;
  if (a.restrictedToInbox || b.restrictedToInbox) return false;
  if (!kindCompatible(a, b)) return false;

  const score = overlapScore(
    `${a.title} ${a.content}`,
    `${b.title} ${b.content}`
  );

  return score >= 0.45;
}

function clusterMemories(memories: Memory[]): Memory[][] {
  const groups: Memory[][] = [];
  const used = new Set<string>();

  for (const memory of memories) {
    if (used.has(memory.id)) continue;

    const group = [memory];
    used.add(memory.id);

    for (const candidate of memories) {
      if (used.has(candidate.id)) continue;
      if (canCompress(memory, candidate)) {
        group.push(candidate);
        used.add(candidate.id);
      }
    }

    groups.push(group);
  }

  return groups;
}

function chooseKind(group: Memory[]): Memory["kind"] {
  if (group.some((g) => g.kind === "warning")) return "warning";
  if (group.some((g) => g.kind === "workflow")) return "workflow";
  if (group.some((g) => g.kind === "preference")) return "preference";
  if (group.some((g) => g.kind === "decision")) return "decision";
  return group[0].kind;
}

function summarizeGroup(group: Memory[]): string {
  const unique = [...new Set(group.map((g) => g.content.trim()))];

  if (unique.length === 1) return unique[0];

  const kind = chooseKind(group);

  if (kind === "workflow" || kind === "preference") {
    return `Standard practice: ${unique.slice(0, 4).join("; ")}.`;
  }

  if (kind === "warning") {
    return `Common warning: ${unique.slice(0, 4).join("; ")}.`;
  }

  return unique.slice(0, 4).join("; ");
}

function buildCompressedMemory(group: Memory[]): Memory {
  const now = Date.now();
  const strongest = Math.max(...group.map((g) => g.strength));
  const latestAccess = Math.max(...group.map((g) => g.lastAccessedAt));
  const totalAccess = group.reduce((sum, g) => sum + g.accessCount, 0);

  return {
    id: crypto.randomUUID(),
    layer: group[0].layer,
    kind: chooseKind(group),
    scope: group[0].scope,
    scopeKey: group[0].scopeKey,
    scopePath: group[0].scopePath,
    title: `Compressed: ${group[0].title.slice(0, 50)}`,
    content: summarizeGroup(group),
    tags: [...new Set(group.flatMap((g) => g.tags))],
    source: "compressed",
    derivedFrom: group.map((g) => g.id),
    evidence: group.map((g) => g.content).join(" | "),
    strength: Math.min(1, strongest + 0.1),
    accessCount: totalAccess,
    lastAccessedAt: latestAccess,
    createdAt: now,
    updatedAt: now,
    stability: "stable",
    status: "active",
    reviewState: "approved",
    sensitivity: "safe",
    sensitivityReasons: [],
    restrictedToInbox: false,
  };
}

export async function compressMemories(): Promise<MemoryMutationResult> {
  return withLockedMemories(async (memories) => {
    const changes = [];

    const candidates = memories.filter(
      (m) =>
        m.status === "active" &&
        m.reviewState === "approved" &&
        !m.restrictedToInbox &&
        m.layer !== "inbox" &&
        m.layer !== "core"
    );

    const groups = clusterMemories(candidates).filter((g) => g.length >= 3);
    const compressed: Memory[] = [];

    for (const group of groups) {
      const newMemory = buildCompressedMemory(group);
      compressed.push(newMemory);
      changes.push(buildCreationChange(newMemory));

      for (const original of memories) {
        if (group.some((g) => g.id === original.id)) {
          const before = { ...original };
          original.status = "archived";
          original.updatedAt = Date.now();
          changes.push(buildMemoryChange(before, original));
        }
      }
    }

    memories.push(...compressed);
    return buildMutationResult("compact", changes);
  });
}
