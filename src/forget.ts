import { loadMemories, saveMemories } from "./memory-store";
import { decayStrength } from "./decay";

export async function forgetWeakMemories(): Promise<number> {
  const memories = await loadMemories();
  const now = Date.now();

  let archivedCount = 0;

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
      memory.status = "archived";
      memory.updatedAt = now;
      archivedCount += 1;
    }
  }

  await saveMemories(memories);
  return archivedCount;
}