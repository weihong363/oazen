import crypto from "crypto";
import { normalizeText, overlapScore } from "../core/utils";
import { ProjectIdentity } from "../project/ProjectIdentity";
import { MemoryLayer, MemoryRecord, ProjectMemoryType } from "./MemoryRecord";

const TYPE_PATTERNS: Array<{ type: ProjectMemoryType; pattern: RegExp }> = [
  { type: "project_rule", pattern: /\b(must|always|required|rule|prefer|avoid|do not|don't)\b/i },
  { type: "decision", pattern: /\b(decided|decision|chose|we will|we use|we keep)\b/i },
  { type: "known_issue", pattern: /\b(root cause|bug|failure|fails|broken|issue)\b/i },
  { type: "todo", pattern: /\b(todo|follow up|remaining|unresolved|next)\b/i },
];

function splitSentences(raw: string): string[] {
  return raw
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => line.length >= 24 && line.length <= 600);
}

function detectType(sentence: string): ProjectMemoryType {
  return TYPE_PATTERNS.find((entry) => entry.pattern.test(sentence))?.type ?? "task_summary";
}

function buildTaskSummary(sentences: string[], raw: string): string {
  const summaryParts = sentences.filter((sentence, index) => {
    const type = detectType(sentence);
    return index === 0 || type === "todo";
  });

  if (summaryParts.length === 0) return summarizeStopInput(raw, 600);
  return summarizeStopInput(summaryParts.join(" "), 1200);
}

export function summarizeStopInput(raw: string, maxChars = 3600): string {
  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return "Turn completed; hook input did not include a detailed transcript.";
  return compact.length <= maxChars ? compact : `${compact.slice(0, maxChars - 1)}…`;
}

export function extractMemoryRecords(
  raw: string,
  project: ProjectIdentity,
  source: MemoryRecord["source"]
): Array<Omit<MemoryRecord, "id" | "createdAt" | "updatedAt" | "lastAccessedAt">> {
  const sentences = splitSentences(raw);
  const records: Array<Omit<MemoryRecord, "id" | "createdAt" | "updatedAt" | "lastAccessedAt">> = sentences.slice(0, 12).map((sentence) => ({
    projectId: project.projectId,
    type: detectType(sentence),
    content: sentence,
    source,
    confidence: 0.58,
    tags: [],
    relatedFiles: Array.from(sentence.matchAll(/\b[\w./-]+\.(?:ts|tsx|js|mjs|json|md|css|html)\b/g)).map(
      (match) => match[0]
    ),
    branch: project.currentBranch,
  }));

  records.unshift({
    projectId: project.projectId,
    type: "task_summary",
    content: buildTaskSummary(sentences, raw),
    source,
    confidence: 0.5,
    tags: ["latest-turn"],
    relatedFiles: [],
    branch: project.currentBranch,
  });

  return records;
}

export type LayeredCompactionStats = {
  before: number;
  after: number;
  beforeActive: number;
  afterActive: number;
  archived: number;
  workingSummaryCreated: boolean;
};

const LAYER_BY_TYPE: Partial<Record<ProjectMemoryType, MemoryLayer>> = {
  project_rule: "stable-rules",
  user_preference: "stable-rules",
  decision: "durable-decisions",
};

function isArchived(record: MemoryRecord): boolean {
  return record.layer === "archive";
}

function archiveRecord(record: MemoryRecord, reason: string, now: number): MemoryRecord {
  if (isArchived(record)) return record;

  return {
    ...record,
    layer: "archive",
    archivedAt: now,
    archiveReason: reason,
    updatedAt: now,
  };
}

function layerFor(record: MemoryRecord): MemoryLayer | undefined {
  return LAYER_BY_TYPE[record.type];
}

function stableRecordId(projectId: string, content: string): string {
  const hash = crypto.createHash("sha256").update(`${projectId}:${content}`).digest("hex").slice(0, 16);
  return `compact_${hash}`;
}

function summarizeRecords(records: MemoryRecord[], maxChars: number): string {
  const parts = records
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map((record) => record.content.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return summarizeStopInput(parts.join(" "), maxChars);
}

function archiveSimilarRecords(records: MemoryRecord[], now: number): MemoryRecord[] {
  const result = [...records];

  for (let i = 0; i < result.length; i++) {
    if (isArchived(result[i])) continue;
    for (let j = i + 1; j < result.length; j++) {
      if (isArchived(result[j])) continue;
      if (result[i].type !== result[j].type) continue;
      const exact = normalizeText(result[i].content) === normalizeText(result[j].content);
      if (!exact && overlapScore(result[i].content, result[j].content) < 0.78) continue;
      const keepIndex = result[i].updatedAt >= result[j].updatedAt ? i : j;
      const archiveIndex = keepIndex === i ? j : i;
      result[archiveIndex] = archiveRecord(result[archiveIndex], "duplicate", now);
    }
  }

  return result;
}

function compactTaskSummaries(records: MemoryRecord[], project: ProjectIdentity, now: number): MemoryRecord[] {
  const taskSummaries = records
    .filter((record) => !isArchived(record) && record.type === "task_summary")
    .sort((left, right) => right.updatedAt - left.updatedAt);
  if (taskSummaries.length <= 1) return records;

  const [latest, ...older] = taskSummaries;
  const summaryContent = summarizeRecords(older, 1200);
  const workingSummary: MemoryRecord = {
    id: stableRecordId(project.projectId, summaryContent),
    projectId: project.projectId,
    type: "task_summary",
    content: summaryContent,
    source: "manual",
    confidence: Math.max(...older.map((record) => record.confidence), 0.55),
    createdAt: Math.min(...older.map((record) => record.createdAt)),
    updatedAt: now,
    lastAccessedAt: now,
    tags: ["working-summary"],
    relatedFiles: [...new Set(older.flatMap((record) => record.relatedFiles))],
    branch: project.currentBranch,
    layer: "working-summary",
  };
  const olderIds = new Set(older.map((record) => record.id));
  const withoutOldWorking = records.filter((record) => record.layer !== "working-summary");

  return [
    ...withoutOldWorking.map((record) => {
      if (record.id === latest.id) return { ...record, layer: "latest-turn" as MemoryLayer, updatedAt: now };
      if (olderIds.has(record.id)) return archiveRecord(record, "merged_into_working_summary", now);
      return record;
    }),
    workingSummary,
  ];
}

function assignDurableLayers(records: MemoryRecord[], now: number): MemoryRecord[] {
  return records.map((record) => {
    if (isArchived(record)) return record;
    if (record.type === "file_note" && record.confidence < 0.5) {
      return archiveRecord(record, "low_value", now);
    }
    const layer = layerFor(record);
    return layer ? { ...record, layer, updatedAt: now } : record;
  });
}

export function compactProjectMemoriesLayered(
  records: MemoryRecord[],
  project: ProjectIdentity
): { records: MemoryRecord[]; stats: LayeredCompactionStats } {
  const now = Date.now();
  const beforeActive = records.filter((record) => !isArchived(record)).length;
  const layered = assignDurableLayers(archiveSimilarRecords(compactTaskSummaries(records, project, now), now), now)
    .sort((left, right) => {
      if (left.layer === "archive" && right.layer !== "archive") return 1;
      if (left.layer !== "archive" && right.layer === "archive") return -1;
      return right.updatedAt - left.updatedAt;
    });
  const afterActive = layered.filter((record) => !isArchived(record)).length;

  return {
    records: layered,
    stats: {
      before: records.length,
      after: layered.length,
      beforeActive,
      afterActive,
      archived: layered.filter((record) => isArchived(record)).length,
      workingSummaryCreated: layered.some((record) => record.layer === "working-summary"),
    },
  };
}
