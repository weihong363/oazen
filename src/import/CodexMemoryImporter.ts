import crypto from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { MemoryRecord, ProjectMemoryType } from "../memory/MemoryRecord";
import { MemoryStore } from "../memory/MemoryStore";
import { ProjectIdentity } from "../project/ProjectIdentity";
import { ProjectResolver } from "../project/ProjectResolver";

type CodexImportCandidate = Omit<MemoryRecord, "id" | "createdAt" | "updatedAt" | "lastAccessedAt">;

export type CodexMemoryImportOptions = {
  cwd?: string;
  scope?: "project";
  dryRun?: boolean;
  sourceDir?: string;
};

type SourceSection = {
  filePath: string;
  startLine: number;
  lines: string[];
};

const MAX_IMPORTED_CONTENT_CHARS = 600;
const CODEX_MEMORY_FILES = ["MEMORY.md", "memory_summary.md"];

function defaultCodexMemoryDir(): string {
  const codexHome = process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(os.homedir(), ".codex");
  return path.join(codexHome, "memories");
}

function hashExcerpt(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function cleanLine(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^\w+:\s+/, (prefix) => (prefix.length <= 16 ? "" : prefix))
    .trim();
}

function trimContent(content: string): string {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length <= MAX_IMPORTED_CONTENT_CHARS
    ? compact
    : `${compact.slice(0, MAX_IMPORTED_CONTENT_CHARS - 1)}…`;
}

function memoryTypeFor(content: string): ProjectMemoryType {
  const lower = content.toLowerCase();
  if (/\b(todo|follow[- ]?up|next)\b|待办|下一步/.test(lower)) return "todo";
  if (/\b(decided|decision|confirmed|chose|agreed)\b|决定|确认/.test(lower)) return "decision";
  if (/\b(always|must|should|prefer|avoid|do not|rule)\b|必须|不要|避免|优先/.test(lower)) return "project_rule";
  if (/\b(symptom|failure|error|bug|risk|blocked|issue)\b|失败|错误|风险|问题/.test(lower)) return "known_issue";
  if (/\b(user asked|user prefers|preference)\b|用户偏好|用户希望/.test(lower)) return "user_preference";
  if (/\b(desc|covers|summary|purpose)\b|总结|概述/.test(lower)) return "project_summary";
  return "file_note";
}

function projectMarkers(project: ProjectIdentity): string[] {
  return [
    project.cwd,
    project.repoRoot,
    project.gitRemote,
  ].flatMap((value) => {
    if (!value) return [];
    const normalized = value.toLowerCase();
    return normalized.length >= 4 ? [normalized] : [];
  });
}

function sectionMatchesProject(section: SourceSection, markers: string[]): boolean {
  const text = section.lines.join("\n").toLowerCase();
  return markers.some((marker) => text.includes(marker));
}

function splitSections(filePath: string, raw: string): SourceSection[] {
  const lines = raw.split(/\r?\n/);
  const sections: SourceSection[] = [];
  let current: SourceSection = { filePath, startLine: 1, lines: [] };

  lines.forEach((line, index) => {
    if (/^#{1,6}\s+/.test(line) && current.lines.length > 0) {
      sections.push(current);
      current = { filePath, startLine: index + 1, lines: [] };
    }
    current.lines.push(line);
  });

  if (current.lines.length > 0) sections.push(current);
  return sections;
}

function candidateLines(section: SourceSection): Array<{ content: string; line: number }> {
  return section.lines.flatMap((line, index) => {
    const raw = line.trim().toLowerCase();
    if (!/^([-*]\s+|\d+\.\s+|\w+:\s+)/.test(raw)) return [];
    if (/^(scope|applies_to|reuse_rule|rollout_summary_files|keywords|updated_at|rollout_path|rollout_summary_file|cwd)\b/.test(raw)) {
      return [];
    }
    if (raw.includes("rollout_path=")) return [];
    const content = trimContent(cleanLine(line));
    if (content.length < 24) return [];
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(content)) return [];
    if (/^\d{4}-\d{2}-\d{2}t/i.test(content)) return [];
    if (content.includes("/archived_sessions/") || content.endsWith(".jsonl")) return [];
    if (/^rollout_summaries\//.test(content)) return [];
    return [{ content, line: section.startLine + index }];
  });
}

async function discoverSourceFiles(sourceDir: string): Promise<string[]> {
  const files = CODEX_MEMORY_FILES.map((fileName) => path.join(sourceDir, fileName));
  const rolloutDir = path.join(sourceDir, "rollout_summaries");

  try {
    const entries = await fs.readdir(rolloutDir);
    files.push(
      ...entries
        .filter((entry) => entry.endsWith(".md"))
        .map((entry) => path.join(rolloutDir, entry))
    );
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }

  return files;
}

async function readSections(sourceDir: string, markers: string[]): Promise<SourceSection[]> {
  const files = await discoverSourceFiles(sourceDir);
  const sections: SourceSection[] = [];

  for (const filePath of files) {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      sections.push(...splitSections(filePath, raw).filter((section) => sectionMatchesProject(section, markers)));
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  return sections;
}

function buildCandidates(project: ProjectIdentity, sections: SourceSection[]): CodexImportCandidate[] {
  const importedAt = Date.now();
  const seen = new Set<string>();

  return sections.flatMap((section) =>
    candidateLines(section).flatMap(({ content, line }) => {
      const key = `${memoryTypeFor(content)}:${content.toLowerCase()}`;
      if (seen.has(key)) return [];
      seen.add(key);

      return [{
        projectId: project.projectId,
        type: memoryTypeFor(content),
        content,
        source: "codex_import",
        confidence: 0.65,
        tags: ["codex-import"],
        relatedFiles: [],
        branch: project.currentBranch,
        provenance: {
          provider: "codex",
          sourcePath: section.filePath,
          sourceLine: line,
          importedAt,
          excerptHash: hashExcerpt(content),
        },
      }];
    })
  );
}

export async function importCodexMemories(
  options: CodexMemoryImportOptions = {},
  store = new MemoryStore(),
  resolver = new ProjectResolver()
): Promise<Record<string, unknown>> {
  if (options.scope && options.scope !== "project") throw new Error(`Unsupported import scope: ${options.scope}`);

  const project = resolver.resolve(options.cwd);
  const sourceDir = path.resolve(options.sourceDir ?? process.env.OAZEN_CODEX_MEMORY_DIR ?? defaultCodexMemoryDir());
  const markers = projectMarkers(project);
  const sections = await readSections(sourceDir, markers);
  const candidates = buildCandidates(project, sections);

  if (options.dryRun) {
    return {
      version: "1",
      kind: "codex_memory_import_result",
      dryRun: true,
      sourceDir,
      project,
      candidates: candidates.length,
      written: 0,
      records: candidates,
    };
  }

  const results = [];
  for (const candidate of candidates) {
    results.push(await store.upsert(candidate));
  }

  return {
    version: "1",
    kind: "codex_memory_import_result",
    dryRun: false,
    sourceDir,
    project,
    candidates: candidates.length,
    written: results.length,
    created: results.filter((result) => result.created).length,
    updated: results.filter((result) => !result.created).length,
    records: results.map((result) => result.record),
  };
}
