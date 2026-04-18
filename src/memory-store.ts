import { promises as fs } from "fs";
import path from "path";
import { Memory } from "./types";

const DATA_PATH = path.resolve(process.cwd(), "data", "memories.json");

export async function loadMemories(): Promise<Memory[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Memory[]) : [];
  } catch (error: any) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function saveMemories(memories: Memory[]): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(memories, null, 2), "utf-8");
}