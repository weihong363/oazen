export type MemoryLayer = "inbox" | "session" | "fact" | "core";
export type MemoryKind =
  | "preference"
  | "fact"
  | "workflow"
  | "warning"
  | "state"
  | "decision";

export type MemoryScope = "global" | "project" | "repo";

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

export type Memory = {
  id: string;
  layer: MemoryLayer;
  kind: MemoryKind;
  scope: MemoryScope;
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
};

export type ContextPacket = {
  core: string[];
  facts: string[];
  workflows: string[];
  warnings: string[];
  state: string[];
};

export type ContextPacket = {
  core: string[];
  facts: string[];
  workflows: string[];
  warnings: string[];
  state: string[];
};