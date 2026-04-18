import { buildMemoryChange, buildMutationResult } from "./contracts";
import { loadMemories, saveMemories } from "./memory-store";
import { MemoryMutationResult } from "./types";

export async function rejectMemory(id: string): Promise<MemoryMutationResult> {
  const memories = await loadMemories();
  const item = memories.find((m) => m.id === id);

  if (!item) {
    throw new Error(`Memory not found: ${id}`);
  }

  const before = { ...item };
  item.status = "rejected";
  item.reviewState = "rejected";
  item.updatedAt = Date.now();

  await saveMemories(memories);
  return buildMutationResult("reject", [buildMemoryChange(before, item)]);
}
