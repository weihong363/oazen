import { detectMemoryConflicts } from "../core/conflicts";
import { buildConflictAwareReviewResult } from "../core/contracts";
import { loadMemories } from "../storage/memory-store";

export async function listInbox() {
  const memories = await loadMemories();
  const pending = memories.filter(
    (memory) =>
      memory.layer === "inbox" &&
      memory.status === "active" &&
      memory.reviewState === "pending"
  );
  const conflicts = detectMemoryConflicts(memories).filter((conflict) =>
    conflict.memoryIds.some((id) => pending.some((memory) => memory.id === id))
  );

  return buildConflictAwareReviewResult(pending, conflicts);
}
