import { buildMemoryChange, buildMutationResult } from "../core/contracts";
import { MemoryMutationResult } from "../core/types";
import { withLockedMemories } from "../storage/memory-store";

export async function rejectMemory(id: string): Promise<MemoryMutationResult> {
  return withLockedMemories(async (memories) => {
    const item = memories.find((m) => m.id === id);

    if (!item) {
      throw new Error(`Memory not found: ${id}`);
    }

    const before = { ...item };
    item.status = "rejected";
    item.reviewState = "rejected";
    item.updatedAt = Date.now();

    return buildMutationResult("reject", [buildMemoryChange(before, item)]);
  });
}
