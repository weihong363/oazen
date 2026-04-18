import { loadMemories, saveMemories } from "./memory-store";

export async function promoteMemory(id: string): Promise<void> {
  const memories = await loadMemories();
  const item = memories.find((m) => m.id === id);
  if (!item) throw new Error(`Memory not found: ${id}`);

  if (item.layer === "inbox") item.layer = "session";
  else if (item.layer === "session") item.layer = "fact";
  else if (item.layer === "fact") item.layer = "core";

  item.strength = Math.min(1, item.strength + 0.15);
  item.updatedAt = Date.now();

  await saveMemories(memories);
}