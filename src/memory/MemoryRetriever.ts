import { tokenize } from "../core/utils";
import { ProjectMemoryType, MemoryRecord } from "./MemoryRecord";
import { MemoryStore } from "./MemoryStore";

export type RetrievedMemory = MemoryRecord & {
  score: number;
};

export type MemoryRetrievalResult = {
  memories: RetrievedMemory[];
  diagnostics: {
    memoryFilePath: string;
    recordsLoaded: number;
    projectRecordsLoaded: number;
    recordsRetrieved: number;
    budgetChars: number;
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

function scoreMemory(record: MemoryRecord, query: string): { score: number; matches: number } {
  const queryTokens = new Set(tokenize(query));
  const recordTokens = tokenize(`${record.type} ${record.content} ${record.tags.join(" ")}`);
  const matches = recordTokens.filter((token) => queryTokens.has(token)).length;
  const ageHours = Math.max(1, (Date.now() - record.updatedAt) / (1000 * 60 * 60));
  const recency = Math.max(0, 4 - Math.log10(ageHours));

  return {
    score: TYPE_PRIORITY[record.type] + matches * 2 + recency + record.confidence,
    matches,
  };
}

function isAlwaysUseful(record: MemoryRecord): boolean {
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

    return {
      memories,
      diagnostics: {
        memoryFilePath: this.store.getFilePath(),
        recordsLoaded: allMemories.length,
        projectRecordsLoaded: activeProjectMemories.length,
        recordsRetrieved: memories.length,
        budgetChars: maxChars,
      },
    };
  }
}
