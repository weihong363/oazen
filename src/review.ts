import { loadMemories } from "./memory-store";

export async function listInbox() {
  const memories = await loadMemories();
  return memories.filter((m) => m.layer === "inbox" && m.status === "active");
}