import { promises as fs } from "fs";
import path from "path";
import { getLogFilePath } from "../storage/runtime-paths";
import { redactSecrets } from "./redaction";

const DEFAULT_LOG_MAX_BYTES = 1024 * 1024;
const DEFAULT_LOG_RETENTION_FILES = 5;

function getLocalTimestamp(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absMinutes / 60)).padStart(2, "0");
  const minutes = String(absMinutes % 60).padStart(2, "0");
  const localDate = new Date(date.getTime() + offsetMinutes * 60 * 1000);

  return `${localDate.toISOString().slice(0, -1)}${sign}${hours}:${minutes}`;
}

function getTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function archiveLogPath(logPath: string, date: Date, index = 0): string {
  const parsed = path.parse(logPath);
  const stamp = date.toISOString().replace(/[:.]/g, "-");
  const suffix = index === 0 ? "" : `.${index}`;
  return path.join(parsed.dir, `${parsed.name}.${stamp}${suffix}${parsed.ext}`);
}

async function nextArchiveLogPath(logPath: string, date: Date): Promise<string> {
  for (let index = 0; index < 100; index++) {
    const candidate = archiveLogPath(logPath, date, index);
    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
  }

  return archiveLogPath(logPath, new Date(), Date.now());
}

async function listArchivedLogs(logPath: string): Promise<string[]> {
  const parsed = path.parse(logPath);
  const entries = await fs.readdir(parsed.dir);
  const prefix = `${parsed.name}.`;
  const currentName = path.basename(logPath);

  return entries
    .filter((entry) => entry !== currentName)
    .filter((entry) => entry.startsWith(prefix) && entry.endsWith(parsed.ext))
    .map((entry) => path.join(parsed.dir, entry))
    .sort();
}

async function applyLogRetention(logPath: string, keepFiles: number): Promise<void> {
  const archives = await listArchivedLogs(logPath);
  const stale = archives.slice(0, Math.max(0, archives.length - keepFiles));

  await Promise.all(stale.map((filePath) => fs.unlink(filePath).catch(() => undefined)));
}

async function shouldRotate(logPath: string, incomingBytes: number, maxBytes: number): Promise<boolean> {
  try {
    const stat = await fs.stat(logPath);
    return stat.size > 0 && stat.size + incomingBytes > maxBytes;
  } catch (error: any) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function rotateLogIfNeeded(logPath: string, line: string, now: Date): Promise<void> {
  const maxBytes = parsePositiveInt(process.env.OAZEN_LOG_MAX_BYTES, DEFAULT_LOG_MAX_BYTES);
  const keepFiles = parsePositiveInt(process.env.OAZEN_LOG_RETENTION_FILES, DEFAULT_LOG_RETENTION_FILES);
  if (!(await shouldRotate(logPath, Buffer.byteLength(line), maxBytes))) return;

  const raw = await fs.readFile(logPath, "utf-8");
  await fs.writeFile(await nextArchiveLogPath(logPath, now), redactSecrets(raw), "utf-8");
  await fs.writeFile(logPath, "", "utf-8");
  await applyLogRetention(logPath, keepFiles);
}

export async function logOazenEvent(event: Record<string, unknown>): Promise<void> {
  const logPath = getLogFilePath();
  const now = new Date();
  const {
    timestamp: _timestamp,
    localTimestamp: _localTimestamp,
    timeZone: _timeZone,
    ...payload
  } = event;
  const line = `${JSON.stringify({
    timestamp: now.toISOString(),
    localTimestamp: getLocalTimestamp(now),
    timeZone: getTimeZone(),
    ...payload,
  })}\n`;

  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await rotateLogIfNeeded(logPath, line, now).catch(() => undefined);
  await fs.appendFile(logPath, redactSecrets(line), "utf-8");
}
