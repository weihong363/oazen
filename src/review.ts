import { loadMemories } from "./memory-store";
import { buildReviewResult } from "./contracts";

export async function listInbox() {
  const memories = await loadMemories();
  const pending = memories.filter(
    (memory) =>
      memory.layer === "inbox" &&
      memory.status === "active" &&
      memory.reviewState === "pending"
  );

  return buildReviewResult(pending);
}
