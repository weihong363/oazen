export type MemoryLayer = "inbox" | "session" | "fact" | "core";

export type MemoryKind =
  | "preference"
  | "fact"
  | "workflow"
  | "warning"
  | "state"
  | "decision";

export type MemoryScope = "global" | "project" | "repo";
export type MemorySource = "user" | "derived" | "compressed";
export type ReviewState = "pending" | "approved" | "rejected";
export type SensitivityLevel = "safe" | "review" | "blocked";

export type ScopeContext = {
  cwd: string;
  globalKey: string;
  repoPath?: string;
  repoKey?: string;
  projectPath?: string;
  projectKey?: string;
  inferredWriteScope: MemoryScope;
  inferredScopeKey: string;
};

export type MemorySafety = {
  level: SensitivityLevel;
  reasons: string[];
  redactedTitle: string;
  redactedContent: string;
  restrictedToInbox: boolean;
};

export type Memory = {
  id: string;
  layer: MemoryLayer;
  kind: MemoryKind;
  scope: MemoryScope;
  scopeKey: string;
  scopePath?: string;
  title: string;
  content: string;
  tags: string[];
  source: MemorySource;
  derivedFrom?: string[];
  evidence?: string;
  strength: number;
  accessCount: number;
  lastAccessedAt: number;
  createdAt: number;
  updatedAt: number;
  stability: "volatile" | "stable";
  status: "active" | "archived" | "rejected";
  reviewState: ReviewState;
  sensitivity: Exclude<SensitivityLevel, "blocked">;
  sensitivityReasons: string[];
  restrictedToInbox: boolean;
};

export type RecallScoreBreakdown = {
  queryMatch: number;
  scope: number;
  layer: number;
  kind: number;
  strength: number;
  total: number;
};

export type RankedMemory = {
  id: string;
  title: string;
  layer: MemoryLayer;
  kind: MemoryKind;
  scope: MemoryScope;
  scopeKey: string;
  content: string;
  score: number;
  scoreBreakdown: RecallScoreBreakdown;
  sensitivity: Memory["sensitivity"];
};

export type RecallResult = {
  version: "1";
  kind: "recall_result";
  action: "recall";
  timestamp: number;
  task: string;
  scope: ScopeContext;
  counts: {
    retrieved: number;
    selected: number;
  };
  tokenEstimate: {
    baseline: number;
    retrieved: number;
    selected: number;
    savedVsBaseline: number;
  };
  candidates: RankedMemory[];
  selected: RankedMemory[];
  memories: RankedMemory[];
  core: string[];
  facts: string[];
  workflows: string[];
  warnings: string[];
  state: string[];
};

export type WritebackBlockedItem = {
  content: string;
  reasons: string[];
};

export type WritebackResult = {
  scope: Pick<ScopeContext, "cwd" | "inferredWriteScope" | "inferredScopeKey">;
  created: Memory[];
  blocked: WritebackBlockedItem[];
};

export type MemorySummary = {
  id: string;
  layer: MemoryLayer;
  kind: MemoryKind;
  scope: MemoryScope;
  scopeKey: string;
  title: string;
  content: string;
  status: Memory["status"];
  reviewState: ReviewState;
  sensitivity: Memory["sensitivity"];
  restrictedToInbox: boolean;
  strength: number;
  updatedAt: number;
  conflictsWith?: string[];
};

export type MemoryChange = {
  before: MemorySummary | null;
  after: MemorySummary | null;
};

export type MemoryConflict = {
  id: string;
  memoryIds: [string, string];
  scope: MemoryScope;
  scopeKey: string;
  kind: MemoryKind;
  reason: "conflicting_guidance";
};

export type MemoryQueryResult = {
  version: "1";
  kind: "memory_query_result";
  action: "review";
  timestamp: number;
  counts: {
    total: number;
    safe: number;
    review: number;
    restricted: number;
    conflicts: number;
  };
  items: MemorySummary[];
  conflicts: MemoryConflict[];
};

export type MemoryMutationAction =
  | "writeback"
  | "approve"
  | "reject"
  | "promote"
  | "compact"
  | "merge"
  | "forget";

export type MemoryMutationResult = {
  version: "1";
  kind: "memory_mutation_result";
  action: MemoryMutationAction;
  timestamp: number;
  counts: {
    matched: number;
    changed: number;
    created: number;
    archived: number;
    rejected: number;
    blocked: number;
  };
  changes: MemoryChange[];
  scope?: Pick<ScopeContext, "cwd" | "inferredWriteScope" | "inferredScopeKey">;
  blocked?: WritebackBlockedItem[];
  conflicts?: MemoryConflict[];
};

export type CliActionError = {
  version: "1";
  kind: "memory_action_error";
  action: string;
  timestamp: number;
  error: {
    message: string;
  };
};
