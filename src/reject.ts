import { loadMemories, saveMemories } from "./memory-store";

export async function rejectMemory(id: string): Promise<void> {
  const memories = await loadMemories();
  const item = memories.find((m) => m.id === id);

  if (!item) {
    throw new Error(`Memory not found: ${id}`);
  }

  item.status = "rejected";
  item.updatedAt = Date.now();

  await saveMemories(memories);
}