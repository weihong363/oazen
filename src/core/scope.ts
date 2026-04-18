import fs from "fs";
import path from "path";
import { Memory, MemoryScope, ScopeContext } from "./types";

function findAncestorDirectory(startPath: string, entryName: string): string | undefined {
  let current = path.resolve(startPath);

  while (true) {
    if (fs.existsSync(path.join(current, entryName))) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function buildScopeKey(scope: MemoryScope, scopePath?: string): string {
  if (scope === "global") return "global";
  return scopePath ? `${scope}:${path.resolve(scopePath)}` : "global";
}

export function inferScopeContext(cwd = process.cwd()): ScopeContext {
  const resolvedCwd = path.resolve(cwd);
  const repoPath = findAncestorDirectory(resolvedCwd, ".git");
  const projectPath = findAncestorDirectory(resolvedCwd, "package.json") ?? repoPath;
  const inferredWriteScope =
    projectPath && repoPath && projectPath !== repoPath
      ? "project"
      : repoPath
        ? "repo"
        : "global";

  return {
    cwd: resolvedCwd,
    globalKey: "global",
    repoPath,
    repoKey: buildScopeKey("repo", repoPath),
    projectPath,
    projectKey: buildScopeKey("project", projectPath),
    inferredWriteScope,
    inferredScopeKey:
      inferredWriteScope === "project"
        ? buildScopeKey("project", projectPath)
        : inferredWriteScope === "repo"
          ? buildScopeKey("repo", repoPath)
          : "global",
  };
}

export function resolveWriteScope(
  context: ScopeContext,
  requestedScope: MemoryScope | "auto" = "auto"
): { scope: MemoryScope; scopeKey: string; scopePath?: string } {
  const scope = requestedScope === "auto" ? context.inferredWriteScope : requestedScope;

  if (scope === "project") {
    return {
      scope,
      scopeKey: context.projectKey ?? context.inferredScopeKey,
      scopePath: context.projectPath,
    };
  }

  if (scope === "repo") {
    return {
      scope,
      scopeKey: context.repoKey ?? context.inferredScopeKey,
      scopePath: context.repoPath,
    };
  }

  return {
    scope: "global",
    scopeKey: "global",
  };
}

export function memoryMatchesScope(memory: Memory, context: ScopeContext): boolean {
  if (memory.scope === "global") return true;
  if (memory.scope === "project") return memory.scopeKey === context.projectKey;
  return memory.scopeKey === context.repoKey;
}

export function scopeBoost(memory: Memory, context: ScopeContext): number {
  if (memory.scope === "project" && memory.scopeKey === context.projectKey) return 4;
  if (memory.scope === "repo" && memory.scopeKey === context.repoKey) return 3;
  if (memory.scope === "global") return 1;
  return 0;
}
