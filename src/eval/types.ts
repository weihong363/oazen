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

export type BenchmarkMetricComparison = {
  baseline: number | null;
  oazen: number | null;
  delta: number | null;
};

export type BenchmarkTaskComparisonResult = {
  id: string;
  query: string | null;
  baselineMetrics: {
    projectRecallPrecision: number | null;
    projectRecallCoverage: number | null;
    crossProjectContaminationRate: number | null;
    contextTokenSaved: number | null;
  };
  oazenMetrics: {
    projectRecallPrecision: number | null;
    projectRecallCoverage: number | null;
    crossProjectContaminationRate: number | null;
    contextTokenSaved: number | null;
  };
  tokenSavingsComparison: BenchmarkMetricComparison;
  recallPrecisionComparison: BenchmarkMetricComparison;
  recallCoverageComparison: BenchmarkMetricComparison;
  scopeContaminationComparison: BenchmarkMetricComparison;
  writeback: null;
  verdict: "better" | "neutral" | "worse";
};

export type BenchmarkCompareResult = {
  version: "1";
  kind: "benchmark_compare_result";
  generatedAt: string;
  baselineReportPath: string;
  oazenReportPath: string;
  fixtureName: string | null;
  baselineMetrics: BenchmarkRunResult["primaryMetrics"] | null;
  oazenMetrics: BenchmarkRunResult["primaryMetrics"] | null;
  tokenSavingsComparison: BenchmarkMetricComparison;
  recallPrecisionComparison: BenchmarkMetricComparison;
  recallCoverageComparison: BenchmarkMetricComparison;
  scopeContaminationComparison: BenchmarkMetricComparison;
  writeback: null;
  verdict: "better" | "neutral" | "worse";
  tasks: BenchmarkTaskComparisonResult[];
};
