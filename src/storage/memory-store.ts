import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getMemoryFilePath } from "./runtime-paths";
import { Memory } from "../core/types";

const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 5000;
const LOCK_STALE_MS = 30000;
const LOCK_INCOMPLETE_GRACE_MS = 1000;

type LockOwner = {
  pid: number;
  token: string;
  acquiredAt: number;
};

function normalizeMemory(input: Partial<Memory>): Memory {
  const now = Date.now();

  return {
    id: input.id ?? crypto.randomUUID(),
    layer: input.layer ?? "inbox",
    kind: input.kind ?? "fact",
    scope: input.scope ?? "global",
    scopeKey: input.scopeKey ?? "global",
    scopePath: input.scopePath,
    title: input.title ?? "",
    content: input.content ?? "",
    tags: input.tags ?? [],
    source: input.source ?? "derived",
    derivedFrom: input.derivedFrom,
    evidence: input.evidence,
    strength: input.strength ?? 0.4,
    accessCount: input.accessCount ?? 0,
    lastAccessedAt: input.lastAccessedAt ?? now,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    stability: input.stability ?? "stable",
    status: input.status ?? "active",
    reviewState:
      input.status === "rejected"
        ? "rejected"
        : input.reviewState ?? (input.layer === "inbox" ? "pending" : "approved"),
    sensitivity: input.sensitivity ?? "safe",
    sensitivityReasons: input.sensitivityReasons ?? [],
    restrictedToInbox: input.restrictedToInbox ?? false,
  };
}

async function readMemoriesFromPath(dataPath: string): Promise<Memory[]> {
  try {
    const raw = await fs.readFile(dataPath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((entry) => normalizeMemory(entry)) : [];
  } catch (error: any) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeMemoriesToPath(dataPath: string, memories: Memory[]): Promise<void> {
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  const tempPath = `${dataPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(memories, null, 2), "utf-8");
  await fs.rename(tempPath, dataPath);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serializeLockOwner(owner: LockOwner): string {
  return JSON.stringify(owner);
}

function parseLockOwner(raw: string): LockOwner | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.pid === "number" &&
      typeof parsed.token === "string" &&
      typeof parsed.acquiredAt === "number"
    ) {
      return parsed as LockOwner;
    }
    return null;
  } catch {
    return null;
  }
}

async function readLockSnapshot(
  lockPath: string
): Promise<{ raw: string; owner: LockOwner | null; ageMs: number } | null> {
  try {
    const [stats, raw] = await Promise.all([
      fs.stat(lockPath),
      fs.readFile(lockPath, "utf-8").catch((error: any) => {
        if (error.code === "ENOENT") return "";
        throw error;
      }),
    ]);

    return {
      raw,
      owner: parseLockOwner(raw),
      ageMs: Date.now() - stats.mtimeMs,
    };
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
    return null;
  }
}

function isStaleSnapshot(snapshot: { owner: LockOwner | null; ageMs: number }): boolean {
  if (snapshot.owner) return snapshot.ageMs > LOCK_STALE_MS;
  return snapshot.ageMs > LOCK_INCOMPLETE_GRACE_MS;
}

async function tryClearStaleLock(lockPath: string): Promise<void> {
  const snapshot = await readLockSnapshot(lockPath);
  if (!snapshot || !isStaleSnapshot(snapshot)) return;

  const current = await readLockSnapshot(lockPath);
  if (!current) return;

  if (current.raw !== snapshot.raw || !isStaleSnapshot(current)) {
    return;
  }

  await fs.unlink(lockPath).catch((error: any) => {
    if (error.code !== "ENOENT") throw error;
  });
}

async function acquireMemoryLock(dataPath: string): Promise<() => Promise<void>> {
  const lockPath = `${dataPath}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  await fs.mkdir(path.dirname(dataPath), { recursive: true });

  while (true) {
    const owner: LockOwner = {
      pid: process.pid,
      token: crypto.randomUUID(),
      acquiredAt: Date.now(),
    };

    try {
      const handle = await fs.open(lockPath, "wx");
      try {
        await handle.writeFile(serializeLockOwner(owner), "utf-8");
      } finally {
        await handle.close();
      }

      return async () => {
        const current = await readLockSnapshot(lockPath);
        if (!current || current.owner?.token !== owner.token) return;

        await fs.unlink(lockPath).catch((error: any) => {
          if (error.code !== "ENOENT") throw error;
        });
      };
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error;
      await tryClearStaleLock(lockPath);
      if (Date.now() >= deadline) {
        throw new Error(`Timed out acquiring memory store lock: ${lockPath}`);
      }
      await sleep(LOCK_RETRY_MS);
    }
  }
}

export async function loadMemories(): Promise<Memory[]> {
  return readMemoriesFromPath(getMemoryFilePath());
}

export async function saveMemories(memories: Memory[]): Promise<void> {
  const dataPath = getMemoryFilePath();
  const release = await acquireMemoryLock(dataPath);

  try {
    await writeMemoriesToPath(dataPath, memories);
  } finally {
    await release();
  }
}

export async function withLockedMemories<T>(
  updater: (memories: Memory[]) => Promise<T> | T
): Promise<T> {
  const dataPath = getMemoryFilePath();
  const release = await acquireMemoryLock(dataPath);

  try {
    const memories = await readMemoriesFromPath(dataPath);
    const result = await updater(memories);
    await writeMemoriesToPath(dataPath, memories);
    return result;
  } finally {
    await release();
  }
}
