import { ProjectIdentity } from "../project/ProjectIdentity";
import { MemoryRecord, ProjectMemoryType } from "./MemoryRecord";

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
