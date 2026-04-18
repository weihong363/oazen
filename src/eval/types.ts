export type BenchmarkWorkspaceFixture = {
  id: string;
  path: string;
  kind: "repo" | "project";
};

export type BenchmarkMemoryFixture = {
  id: string;
  title: string;
  content: string;
  kind: "preference" | "fact" | "workflow" | "warning" | "state" | "decision";
  workspaceId?: string;
  scope?: "global" | "project" | "repo";
  layer?: "session" | "fact" | "core";
  tags?: string[];
  strength?: number;
};

export type BenchmarkTaskFixture = {
  id: string;
  projectId: string;
  workspaceId: string;
  query: string;
  relevantMemoryIds: string[];
  keyMemoryIds: string[];
  limit?: number;
  targets?: {
    minPrecision?: number;
    minCoverage?: number;
    maxContamination?: number;
    minTokenSaved?: number;
  };
};

export type BenchmarkFixture = {
  version: "1";
  name: string;
  workspaces: BenchmarkWorkspaceFixture[];
  memories: BenchmarkMemoryFixture[];
  tasks: BenchmarkTaskFixture[];
};

export type BenchmarkTaskResult = {
  id: string;
  projectId: string;
  query: string;
  selectedMemoryIds: string[];
  relevantSelectedIds: string[];
  crossProjectSelectedIds: string[];
  projectRecallPrecision: number;
  projectRecallCoverage: number;
  crossProjectContaminationRate: number;
  contextTokenSaved: number;
  averageContextSizePerTask: number;
  recallToContextRatio: number;
  timeToResumeMs: null;
  targets: BenchmarkTaskFixture["targets"];
  passed: boolean;
  failures: string[];
};

export type BenchmarkRunResult = {
  version: "1";
  kind: "benchmark_run_result";
  name: string;
  generatedAt: string;
  fixturePath: string;
  primaryMetrics: {
    projectRecallPrecision: number;
    projectRecallCoverage: number;
    crossProjectContaminationRate: number;
    contextTokenSaved: number;
    averageContextSizePerTask: number;
    recallToContextRatio: number;
  };
  workflowMetrics: {
    timeToResumeMs: null;
    notes: string[];
  };
  tasks: BenchmarkTaskResult[];
  passed: boolean;
};
