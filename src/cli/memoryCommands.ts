import { MemoryStore } from "../memory/MemoryStore";
import { compactProjectMemoriesLayered } from "../memory/MemoryCompactor";
import { ProjectMemoryType } from "../memory/MemoryRecord";
import { ProjectResolver } from "../project/ProjectResolver";

const MEMORY_TYPES = new Set<ProjectMemoryType>([
  "project_summary",
  "project_rule",
  "decision",
  "task_summary",
  "known_issue",
  "todo",
  "user_preference",
  "file_note",
]);

function parseMemoryType(value: string): ProjectMemoryType {
  if (!MEMORY_TYPES.has(value as ProjectMemoryType)) {
    throw new Error(`Unsupported memory type: ${value}`);
  }

  return value as ProjectMemoryType;
}

export async function listProjectMemories(cwd = process.cwd()): Promise<Record<string, unknown>> {
  const project = new ProjectResolver().resolve(cwd);
  const records = await new MemoryStore().listByProject(project.projectId);

  return {
    version: "1",
    kind: "project_memory_list",
    project,
    count: records.length,
    records,
  };
}

export async function showProjectMemory(id: string): Promise<Record<string, unknown>> {
  const records = await new MemoryStore().list();
  const record = records.find((item) => item.id === id);

  if (!record) throw new Error(`Memory not found: ${id}`);

  return {
    version: "1",
    kind: "project_memory_record",
    record,
  };
}

export async function addProjectMemory(
  content: string,
  options: { cwd?: string; type?: string; tags?: string }
): Promise<Record<string, unknown>> {
  if (!content.trim()) throw new Error("Memory content is required");

  const project = new ProjectResolver().resolve(options.cwd);
  const type = parseMemoryType(options.type ?? "file_note");
  const tags = (options.tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const result = await new MemoryStore().upsert({
    projectId: project.projectId,
    type,
    content: content.trim(),
    source: "manual",
    confidence: 0.8,
    tags,
    relatedFiles: [],
    branch: project.currentBranch,
  });

  return {
    version: "1",
    kind: "project_memory_mutation",
    action: "add",
    created: result.created,
    record: result.record,
  };
}

type CompactOptions = {
  cwd?: string;
  strategy?: string;
};

function parseCompactStrategy(strategy = "sort"): "sort" | "layered" {
  if (strategy === "sort" || strategy === "layered") return strategy;
  throw new Error(`Unsupported memory compact strategy: ${strategy}`);
}

export async function compactProjectMemories(options: CompactOptions = {}): Promise<Record<string, unknown>> {
  const store = new MemoryStore();
  const project = new ProjectResolver().resolve(options.cwd);
  const before = await store.list();
  const projectRecords = before.filter((record) => record.projectId === project.projectId);
  const otherRecords = before.filter((record) => record.projectId !== project.projectId);
  const strategy = parseCompactStrategy(options.strategy);
  const compactedResult = strategy === "layered"
    ? compactProjectMemoriesLayered(projectRecords, project)
    : {
        records: projectRecords.sort((left, right) => right.updatedAt - left.updatedAt),
        stats: undefined,
      };
  const compacted = compactedResult.records;
  await store.save([...otherRecords, ...compacted]);

  return {
    version: "1",
    kind: "project_memory_mutation",
    action: "compact",
    strategy,
    projectId: project.projectId,
    before: projectRecords.length,
    after: compacted.length,
    stats: compactedResult.stats,
  };
}
