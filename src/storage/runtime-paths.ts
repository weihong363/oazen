import path from "path";

const REPO_ROOT = path.resolve(__dirname, "..");

export function getMemoryFilePath(): string {
  const explicitFile = process.env.OAZEN_MEMORY_FILE;
  if (explicitFile) return path.resolve(explicitFile);

  const dataDir = process.env.OAZEN_DATA_DIR
    ? path.resolve(process.env.OAZEN_DATA_DIR)
    : path.join(process.env.OAZEN_HOME ? path.resolve(process.env.OAZEN_HOME) : REPO_ROOT, "data");

  return path.join(dataDir, "memories.json");
}
