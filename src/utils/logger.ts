import { promises as fs } from "fs";
import path from "path";
import { getLogFilePath } from "../storage/runtime-paths";
import { redactSecrets } from "./redaction";

export async function logOazenEvent(event: Record<string, unknown>): Promise<void> {
  const logPath = getLogFilePath();
  const line = `${JSON.stringify({
    timestamp: new Date().toISOString(),
    ...event,
  })}\n`;

  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, redactSecrets(line), "utf-8");
}
