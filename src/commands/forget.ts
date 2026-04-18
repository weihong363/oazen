import { buildMemoryChange, buildMutationResult } from "../core/contracts";
import { decayStrength } from "../core/decay";
import { MemoryMutationResult } from "../core/types";
import { withLockedMemories } from "../storage/memory-store";

export async function forgetWeakMemories(): Promise<MemoryMutationResult> {
  return withLockedMemories(async (memories) => {
    const now = Date.now();
    const changes = [];

    for (const memory of memories) {
      if (memory.status !== "active") continue;

      memory.strength = decayStrength(memory, now);

      const ageDays = (now - memory.updatedAt) / (1000 * 60 * 60 * 24);

      const shouldArchiveInbox =
        memory.layer === "inbox" &&
        ageDays > 7 &&
        memory.strength < 0.2;

      const shouldArchiveSession =
        memory.layer === "session" &&
        ageDays > 21 &&
        memory.strength < 0.15;

      const shouldArchiveFact =
        memory.layer === "fact" &&
        ageDays > 90 &&
        memory.strength < 0.08;

      if (shouldArchiveInbox || shouldArchiveSession || shouldArchiveFact) {
        const before = { ...memory };
        memory.status = "archived";
        memory.updatedAt = now;
        changes.push(buildMemoryChange(before, memory));
      }
    }

    return buildMutationResult("forget", changes);
  });
}
