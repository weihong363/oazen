import { decayStrength } from "./decay";
import { loadMemories, saveMemories } from "./memory-store";
import { ContextPacket, Memory } from "./types";
import { tokenize } from "./utils";

function scoreMemory(memory: Memory, task: string): number {
  const tokens = new Set(tokenize(task));
  let score = 0;

  for (const token of tokenize(memory.title)) {
    if (tokens.has(token)) score += 3;
  }

  for (const token of tokenize(memory.content)) {
    if (tokens.has(token)) score += 2;
  }

  for (const tag of memory.tags) {
    if (tokens.has(tag.toLowerCase())) score += 2;
  }

  const layerBoost =
    memory.layer === "core" ? 4 :
    memory.layer === "fact" ? 2.5 :
    memory.layer === "session" ? 1.5 : 0.2;

  const kindBoost =
    memory.kind === "warning" ? 1.5 :
    memory.kind === "workflow" ? 1.2 : 0.5;

  return score + layerBoost + kindBoost + memory.strength * 3;
}

export async function recall(task: string): Promise<ContextPacket> {
  const memories = await loadMemories();
  const now = Date.now();

  const active = memories
    .filter((m) => m.status === "active")
    .map((m) => ({ ...m, strength: decayStrength(m, now) }))
    .filter((m) => m.strength > 0.08)
    .filter((m) => m.layer !== "inbox");

  const ranked = active
    .map((m) => ({ memory: m, score: scoreMemory(m, task) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((x) => x.memory);

  for (const m of memories) {
    const selected = ranked.find((r) => r.id === m.id);
    if (selected) {
      m.accessCount += 1;
      m.lastAccessedAt = now;
      m.updatedAt = now;
      m.strength = selected.strength;
    } else {
      m.strength = decayStrength(m, now);
      if (m.layer === "inbox" && m.strength < 0.05) {
        m.status = "archived";
      }
    }
  }

  await saveMemories(memories);

  return {
    core: ranked.filter((m) => m.layer === "core").map((m) => m.content),
    facts: ranked.filter((m) => m.kind === "fact" || m.kind === "decision").map((m) => m.content),
    workflows: ranked.filter((m) => m.kind === "workflow" || m.kind === "preference").map((m) => m.content),
    warnings: ranked.filter((m) => m.kind === "warning").map((m) => m.content),
    state: ranked.filter((m) => m.kind === "state").map((m) => m.content),
  };
}