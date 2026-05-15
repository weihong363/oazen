import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getProjectMemoryFilePath } from "../storage/runtime-paths";
import { normalizeText, overlapScore } from "../core/utils";
import { MemoryRecord } from "./MemoryRecord";

type ProjectMemoryFile = {
  version: "1";
  records: MemoryRecord[];
};

function nowRecord(input: Omit<MemoryRecord, "id" | "createdAt" | "updatedAt" | "lastAccessedAt">): MemoryRecord {
  const now = Date.now();

  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
  };
}

function normalizeRecord(input: Partial<MemoryRecord>): MemoryRecord | null {
  if (!input.projectId || !input.type || !input.content) return null;
  const now = Date.now();

  return {
    id: input.id ?? crypto.randomUUID(),
    projectId: input.projectId,
    type: input.type,
    content: input.content.trim(),
    source: input.source ?? "manual",
    confidence: input.confidence ?? 0.6,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    lastAccessedAt: input.lastAccessedAt ?? now,
    tags: input.tags ?? [],
    relatedFiles: input.relatedFiles ?? [],
    branch: input.branch,
    ttlDays: input.ttlDays,
  };
}

function isSimilarRecord(left: MemoryRecord, right: MemoryRecord): boolean {
  if (left.projectId !== right.projectId || left.type !== right.type) return false;

  const exact = normalizeText(left.content) === normalizeText(right.content);
  const similar = overlapScore(left.content, right.content) >= 0.78;
  return exact || similar;
}

export class MemoryStore {
  constructor(private readonly filePath = getProjectMemoryFilePath()) {}

  getFilePath(): string {
    return this.filePath;
  }

  async list(): Promise<MemoryRecord[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<ProjectMemoryFile> | MemoryRecord[];
      const records = Array.isArray(parsed) ? parsed : parsed.records;
      return (records ?? []).flatMap((record) => {
        const normalized = normalizeRecord(record);
        return normalized ? [normalized] : [];
      });
    } catch (error: any) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async save(records: MemoryRecord[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const payload: ProjectMemoryFile = { version: "1", records };
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf-8");
  }

  async listByProject(projectId: string): Promise<MemoryRecord[]> {
    return (await this.list()).filter((record) => record.projectId === projectId);
  }

  async upsert(
    input: Omit<MemoryRecord, "id" | "createdAt" | "updatedAt" | "lastAccessedAt">
  ): Promise<{ record: MemoryRecord; created: boolean }> {
    const records = await this.list();
    const incoming = nowRecord(input);
    const existingIndex = records.findIndex((record) => isSimilarRecord(record, incoming));

    if (existingIndex >= 0) {
      const existing = records[existingIndex];
      const updated: MemoryRecord = {
        ...existing,
        content: incoming.content.length >= existing.content.length ? incoming.content : existing.content,
        confidence: Math.max(existing.confidence, incoming.confidence),
        tags: [...new Set([...existing.tags, ...incoming.tags])],
        relatedFiles: [...new Set([...existing.relatedFiles, ...incoming.relatedFiles])],
        branch: incoming.branch ?? existing.branch,
        updatedAt: incoming.updatedAt,
        lastAccessedAt: incoming.lastAccessedAt,
      };
      records[existingIndex] = updated;
      await this.save(records);
      return { record: updated, created: false };
    }

    records.push(incoming);
    await this.save(records);
    return { record: incoming, created: true };
  }

  async touch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const records = await this.list();
    const now = Date.now();
    let changed = false;

    for (const record of records) {
      if (!idSet.has(record.id)) continue;
      record.lastAccessedAt = now;
      changed = true;
    }

    if (changed) await this.save(records);
  }
}
