import { promises as fs } from "fs";
import path from "path";
import { getLogFilePath } from "../storage/runtime-paths";
import { redactSecrets } from "./redaction";

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
  await fs.appendFile(logPath, redactSecrets(line), "utf-8");
}
