import path from "path";
import os from "os";

export function getOazenHome(): string {
  return process.env.OAZEN_HOME ? path.resolve(process.env.OAZEN_HOME) : path.join(os.homedir(), ".oazen");
}

export function getMemoryFilePath(): string {
  const explicitFile = process.env.OAZEN_MEMORY_FILE;
  if (explicitFile) return path.resolve(explicitFile);

  const dataDir = process.env.OAZEN_DATA_DIR
    ? path.resolve(process.env.OAZEN_DATA_DIR)
    : path.join(getOazenHome(), "data");

  return path.join(dataDir, "memories.json");
}

export function getProjectMemoryFilePath(): string {
  const explicitFile = process.env.OAZEN_PROJECT_MEMORY_FILE;
  if (explicitFile) return path.resolve(explicitFile);

  const dataDir = process.env.OAZEN_DATA_DIR
    ? path.resolve(process.env.OAZEN_DATA_DIR)
    : path.join(getOazenHome(), "data");

  return path.join(dataDir, "project-memories.json");
}

export function getLogFilePath(): string {
  const explicitFile = process.env.OAZEN_LOG_FILE;
  if (explicitFile) return path.resolve(explicitFile);

  return path.join(getOazenHome(), "logs", "oazen.log");
}
