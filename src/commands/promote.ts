import { buildMemoryChange, buildMutationResult } from "../core/contracts";
import { MemoryMutationResult } from "../core/types";
import { withLockedMemories } from "../storage/memory-store";

export async function promoteMemory(id: string): Promise<MemoryMutationResult> {
  return withLockedMemories(async (memories) => {
    const item = memories.find((m) => m.id === id);
    if (!item) throw new Error(`Memory not found: ${id}`);
    if (item.status !== "active") throw new Error(`Memory is not active: ${id}`);
    if (item.layer === "inbox") throw new Error(`Use approve for inbox memory: ${id}`);
    if (item.reviewState !== "approved") throw new Error(`Memory is not approved: ${id}`);
    if (item.restrictedToInbox) throw new Error(`Sensitive inbox-only memory cannot be promoted: ${id}`);

    const before = { ...item };
    if (item.layer === "session") item.layer = "fact";
    else if (item.layer === "fact") item.layer = "core";
    else throw new Error(`Memory cannot be promoted from layer ${item.layer}: ${id}`);

    item.strength = Math.min(1, item.strength + 0.15);
    item.updatedAt = Date.now();

    return buildMutationResult("promote", [buildMemoryChange(before, item)]);
  });
}
