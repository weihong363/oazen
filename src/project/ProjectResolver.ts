import crypto from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { ProjectIdentity } from "./ProjectIdentity";

function runGit(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function findAncestor(startPath: string, entryName: string): string | undefined {
  let current = path.resolve(startPath);

  while (true) {
    if (fs.existsSync(path.join(current, entryName))) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function readProjectIdFromConfig(projectRoot: string): string | undefined {
  const candidates = [
    path.join(projectRoot, ".oazen.json"),
    path.join(projectRoot, ".oazen", "config.json"),
  ];

  for (const filePath of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (typeof parsed?.projectId === "string" && parsed.projectId.trim()) {
        return parsed.projectId.trim();
      }
      if (typeof parsed?.oazen?.projectId === "string" && parsed.oazen.projectId.trim()) {
        return parsed.oazen.projectId.trim();
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function stableHash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export class ProjectResolver {
  resolve(cwd = process.cwd()): ProjectIdentity {
    const resolvedCwd = path.resolve(cwd);
    const repoRoot = runGit(resolvedCwd, ["rev-parse", "--show-toplevel"]);
    const projectRoot = repoRoot ?? findAncestor(resolvedCwd, "package.json") ?? resolvedCwd;
    const gitRemote = repoRoot ? runGit(repoRoot, ["config", "--get", "remote.origin.url"]) : undefined;
    const currentBranch = repoRoot
      ? runGit(repoRoot, ["branch", "--show-current"]) ?? runGit(repoRoot, ["rev-parse", "--short", "HEAD"])
      : undefined;
    const explicitProjectId = readProjectIdFromConfig(projectRoot);
    const identitySource = explicitProjectId ?? gitRemote ?? repoRoot ?? projectRoot;
    const now = Date.now();

    return {
      projectId: explicitProjectId ?? `project_${stableHash(identitySource)}`,
      repoRoot,
      gitRemote,
      currentBranch,
      workspaceName: path.basename(projectRoot),
      cwd: resolvedCwd,
      createdAt: now,
      updatedAt: now,
    };
  }
}
