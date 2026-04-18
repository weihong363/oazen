import crypto from "crypto";
import { promises as fs } from "fs";
import { loadMemories, saveMemories } from "./memory-store";
import { mergeIntoList } from "./merge";
import { Memory, MemoryKind } from "./types";

function detectKind(sentence: string): MemoryKind | null {
  const s = sentence.toLowerCase();

  if (s.includes("avoid") || s.includes("do not") || s.includes("don't")) return "warning";
  if (s.includes("prefer") || s.includes("always")) return "preference";
  if (s.includes("fixed by") || s.includes("run ") || s.includes("steps")) return "workflow";
  if (s.includes("root cause") || s.includes("uses ") || s.includes("is ")) return "fact";
  if (s.includes("decided") || s.includes("we chose")) return "decision";

  return null;
}

function initialLayer(kind: MemoryKind): Memory["layer"] {
  if (kind === "warning" || kind === "workflow") return "inbox";
  return "inbox";
}

function buildMemory(sentence: string, kind: MemoryKind): Memory {
  const now = Date.now();

  return {
    id: crypto.randomUUID(),
    layer: initialLayer(kind),
    kind,
    scope: "global",
    title: sentence.slice(0, 80),
    content: sentence.trim(),
    tags: [],
    source: "derived",
    evidence: sentence.trim(),
    strength: 0.55,
    accessCount: 0,
    lastAccessedAt: now,
    createdAt: now,
    updatedAt: now,
    stability: kind === "state" ? "volatile" : "stable",
    status: "active",
  };
}

export async function writebackFromFile(filePath: string): Promise<Memory[]> {
  const raw = await fs.readFile(filePath, "utf-8");

  const sentences = raw
    .split(/\n|[.!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 18);

  const extracted = sentences
    .map((s) => {
      const kind = detectKind(s);
      return kind ? buildMemory(s, kind) : null;
    })
    .filter(Boolean) as Memory[];

  let current = await loadMemories();

  for (const item of extracted) {
    current = mergeIntoList(current, item);
  }

  await saveMemories(current);
  return extracted;
}