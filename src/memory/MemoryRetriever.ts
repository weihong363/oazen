import { tokenize } from "../core/utils";
import { ProjectMemoryType, MemoryRecord } from "./MemoryRecord";
import { MemoryStore } from "./MemoryStore";

export type RetrievedMemory = MemoryRecord & {
  score: number;
  matches: number;
  decayScore: number;
  accessBoost: number;
};

export type MemoryRetrievalResult = {
  memories: RetrievedMemory[];
  diagnostics: {
    memoryFilePath: string;
    recordsLoaded: number;
    projectRecordsLoaded: number;
    recordsRetrieved: number;
    budgetChars: number;
    decayScoreMin?: number;
    decayScoreMax?: number;
  };
};

const TYPE_PRIORITY: Record<ProjectMemoryType, number> = {
  project_summary: 9,
  project_rule: 8,
  decision: 7,
  task_summary: 6,
  known_issue: 5,
  todo: 4,
  user_preference: 6,
  file_note: 3,
};

const DECAY_RATE_BY_TYPE: Record<ProjectMemoryType, number> = {
  project_summary: 0.015,
  project_rule: 0.01,
  decision: 0.012,
  task_summary: 0.08,
  known_issue: 0.05,
  todo: 0.06,
  user_preference: 0.01,
  file_note: 0.12,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function decayScore(record: MemoryRecord, now = Date.now()): number {
  const anchor = record.lastInjectedAt ?? record.lastAccessedAt ?? record.updatedAt;
  const ageDays = Math.max(0, (now - anchor) / (1000 * 60 * 60 * 24));
  const accessCount = record.accessCount ?? 0;
  const accessReinforcement = Math.min(accessCount * 0.04, 0.25);
  const base = 1 - ageDays * DECAY_RATE_BY_TYPE[record.type] + accessReinforcement;
  const minimum = record.pinned ? 0.72 : 0.05;
  return clamp(base, minimum, 1);
}

function accessBoost(record: MemoryRecord): number {
  return Math.min((record.accessCount ?? 0) * 0.18, 1.8);
}

function scoreMemory(record: MemoryRecord, query: string): { score: number; matches: number; decayScore: number; accessBoost: number } {
  const queryTokens = new Set(tokenize(query));
  const recordTokens = tokenize(`${record.type} ${record.content} ${record.tags.join(" ")}`);
  const matches = recordTokens.filter((token) => queryTokens.has(token)).length;
  const decay = decayScore(record);
  const boost = accessBoost(record);

  return {
    score: TYPE_PRIORITY[record.type] + matches * 2 + decay * 4 + boost + record.confidence,
    matches,
    decayScore: decay,
    accessBoost: boost,
  };
}

function isAlwaysUseful(record: MemoryRecord): boolean {
  if (record.pinned) return true;
  return record.type === "project_rule" || record.type === "project_summary" || record.type === "user_preference";
}

function trimToBudget(lines: string[], maxChars: number): string[] {
  const selected: string[] = [];
  let total = 0;

  for (const line of lines) {
    if (total + line.length + 1 > maxChars) break;
    selected.push(line);
    total += line.length + 1;
  }

  return selected;
}

export class MemoryRetriever {
  constructor(private readonly store = new MemoryStore()) {}

  async retrieve(projectId: string, query: string, maxChars: number): Promise<RetrievedMemory[]> {
    return (await this.retrieveWithDiagnostics(projectId, query, maxChars)).memories;
  }

  async retrieveWithDiagnostics(
    projectId: string,
    query: string,
    maxChars: number
  ): Promise<MemoryRetrievalResult> {
    const allMemories = await this.store.list();
    const projectMemories = allMemories.filter((record) => record.projectId === projectId);
    const activeProjectMemories = projectMemories.filter((record) => record.layer !== "archive");
    const ranked = activeProjectMemories
      .map((record) => ({ ...record, ...scoreMemory(record, query) }))
      .filter((record) => record.matches > 0 || isAlwaysUseful(record))
      .sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt);

    const lines = trimToBudget(
      ranked.map((record) => `${record.id}\t${record.type}\t${record.content}`),
      maxChars
    );
    const allowedIds = new Set(lines.map((line) => line.split("\t")[0]));
    const memories = ranked.filter((record) => allowedIds.has(record.id));
    const decayScores = memories.map((record) => record.decayScore);

    return {
      memories,
      diagnostics: {
        memoryFilePath: this.store.getFilePath(),
        recordsLoaded: allMemories.length,
        projectRecordsLoaded: activeProjectMemories.length,
        recordsRetrieved: memories.length,
        budgetChars: maxChars,
        decayScoreMin: decayScores.length > 0 ? Math.min(...decayScores) : undefined,
        decayScoreMax: decayScores.length > 0 ? Math.max(...decayScores) : undefined,
      },
    };
  }
}
