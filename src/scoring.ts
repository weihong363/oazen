import { Memory } from "./types";

function tokenize(text: string) {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

export function scoreMemory(memory: Memory, task: string) {
  const tokens = new Set(tokenize(task));
  let score = 0;

  for (const t of tokenize(memory.title)) {
    if (tokens.has(t)) score += 3;
  }

  for (const t of tokenize(memory.content)) {
    if (tokens.has(t)) score += 2;
  }

  if (memory.kind === "warning") score += 1;

  return score;
}