import { buildMemoryChange, buildMutationResult } from "./contracts";
import { loadMemories, saveMemories } from "./memory-store";
import { MemoryMutationResult } from "./types";

export async function approveMemory(id: string): Promise<MemoryMutationResult> {
  const memories = await loadMemories();
  const item = memories.find((memory) => memory.id === id);

  if (!item) throw new Error(`Memory not found: ${id}`);
  if (item.status !== "active") throw new Error(`Memory is not active: ${id}`);
  if (item.layer !== "inbox") throw new Error(`Only inbox memories can be approved: ${id}`);
  if (item.reviewState !== "pending") throw new Error(`Memory is not pending review: ${id}`);
  if (item.restrictedToInbox) {
    throw new Error(`Sensitive inbox-only memory cannot be approved: ${id}`);
  }

  const before = { ...item };
  item.layer = "session";
  item.reviewState = "approved";
  item.strength = Math.min(1, item.strength + 0.12);
  item.updatedAt = Date.now();

  await saveMemories(memories);
  return buildMutationResult("approve", [buildMemoryChange(before, item)]);
}
