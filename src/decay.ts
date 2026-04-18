import { Memory } from "./types";

export function decayStrength(memory: Memory, now = Date.now()): number {
  const days = (now - memory.lastAccessedAt) / (1000 * 60 * 60 * 24);

  let decayRate = 0.02;
  if (memory.layer === "session") decayRate = 0.15;
  if (memory.layer === "fact") decayRate = 0.03;
  if (memory.layer === "core") decayRate = 0.005;
  if (memory.layer === "inbox") decayRate = 0.3;

  const reinforced = Math.min(memory.accessCount * 0.03, 0.25);
  const value = memory.strength - days * decayRate + reinforced;
  return Math.max(0, Math.min(1, value));
}