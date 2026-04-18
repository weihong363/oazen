import crypto from "crypto";
import { Memory, MemoryConflict } from "./types";
import { normalizeText, overlapScore, tokenize } from "./utils";

const NEGATIVE_PATTERNS = [
  /\bdo not\b/i,
  /\bdon't\b/i,
  /\bavoid\b/i,
  /\bnever\b/i,
  /\binstead of\b/i,
  /\bmust not\b/i,
  /\bcannot\b/i,
  /\bcan't\b/i,
];

const POSITIVE_PATTERNS = [
  /\bprefer\b/i,
  /\balways\b/i,
  /\buse\b/i,
  /\bshould\b/i,
  /\bmust\b/i,
  /\bkeep\b/i,
];

function polarity(text: string): "negative" | "positive" | "neutral" {
  if (NEGATIVE_PATTERNS.some((pattern) => pattern.test(text))) return "negative";
  if (POSITIVE_PATTERNS.some((pattern) => pattern.test(text))) return "positive";
  return "neutral";
}

function sharedTokenCount(a: string, b: string): number {
  const left = new Set(tokenize(normalizeText(a)));
  const right = new Set(tokenize(normalizeText(b)));
  let count = 0;

  for (const token of left) {
    if (right.has(token)) count += 1;
  }

  return count;
}

export function detectMemoryConflicts(memories: Memory[]): MemoryConflict[] {
  const active = memories
    .filter((memory) => memory.status === "active")
    .filter((memory) => memory.reviewState !== "rejected");
  const conflicts: MemoryConflict[] = [];

  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const left = active[i];
      const right = active[j];

      if (left.id === right.id) continue;
      if (left.kind !== right.kind) continue;
      if (left.scope !== right.scope) continue;
      if (left.scopeKey !== right.scopeKey) continue;
      const leftPolarity = polarity(left.content);
      const rightPolarity = polarity(right.content);
      if (leftPolarity === "neutral" || rightPolarity === "neutral") continue;
      if (leftPolarity === rightPolarity) continue;

      const combinedLeft = `${left.title} ${left.content}`;
      const combinedRight = `${right.title} ${right.content}`;
      if (overlapScore(combinedLeft, combinedRight) < 0.45) continue;
      if (sharedTokenCount(combinedLeft, combinedRight) < 3) continue;

      conflicts.push({
        id: crypto.randomUUID(),
        memoryIds: [left.id, right.id],
        scope: left.scope,
        scopeKey: left.scopeKey,
        kind: left.kind,
        reason: "conflicting_guidance",
      });
    }
  }

  return conflicts;
}
