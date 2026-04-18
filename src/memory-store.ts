import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getMemoryFilePath } from "./runtime-paths";
import { Memory } from "./types";

function normalizeMemory(input: Partial<Memory>): Memory {
  const now = Date.now();

  return {
    id: input.id ?? crypto.randomUUID(),
    layer: input.layer ?? "inbox",
    kind: input.kind ?? "fact",
    scope: input.scope ?? "global",
    scopeKey: input.scopeKey ?? "global",
    scopePath: input.scopePath,
    title: input.title ?? "",
    content: input.content ?? "",
    tags: input.tags ?? [],
    source: input.source ?? "derived",
    derivedFrom: input.derivedFrom,
    evidence: input.evidence,
    strength: input.strength ?? 0.4,
    accessCount: input.accessCount ?? 0,
    lastAccessedAt: input.lastAccessedAt ?? now,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    stability: input.stability ?? "stable",
    status: input.status ?? "active",
    reviewState:
      input.status === "rejected"
        ? "rejected"
        : input.reviewState ?? (input.layer === "inbox" ? "pending" : "approved"),
    sensitivity: input.sensitivity ?? "safe",
    sensitivityReasons: input.sensitivityReasons ?? [],
    restrictedToInbox: input.restrictedToInbox ?? false,
  };
}

export async function loadMemories(): Promise<Memory[]> {
  const dataPath = getMemoryFilePath();

  try {
    const raw = await fs.readFile(dataPath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((entry) => normalizeMemory(entry)) : [];
  } catch (error: any) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function saveMemories(memories: Memory[]): Promise<void> {
  const dataPath = getMemoryFilePath();
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify(memories, null, 2), "utf-8");
}
