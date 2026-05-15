export type ProjectMemoryType =
  | "project_summary"
  | "project_rule"
  | "decision"
  | "task_summary"
  | "known_issue"
  | "todo"
  | "user_preference"
  | "file_note";

export type ProjectMemorySource =
  | "session_start"
  | "user_prompt_submit"
  | "stop"
  | "manual"
  | "codex_import";

export type MemoryProvenance = {
  provider: "codex";
  sourcePath: string;
  sourceLine?: number;
  importedAt: number;
  excerptHash: string;
};

export type MemoryLayer =
  | "latest-turn"
  | "working-summary"
  | "stable-rules"
  | "durable-decisions"
  | "archive";

export type MemoryRecord = {
  id: string;
  projectId: string;
  type: ProjectMemoryType;
  content: string;
  source: ProjectMemorySource;
  confidence: number;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  tags: string[];
  relatedFiles: string[];
  branch?: string;
  ttlDays?: number;
  provenance?: MemoryProvenance;
  layer?: MemoryLayer;
  archivedAt?: number;
  archiveReason?: string;
};
