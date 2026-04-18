import fs from "fs";
import os from "os";
import path from "path";
import { recall } from "../commands/recall";
import { resolveWriteScope, inferScopeContext } from "../core/scope";
import { Memory } from "../core/types";
import {
  BenchmarkFixture,
  BenchmarkMemoryFixture,
  BenchmarkRunResult,
  BenchmarkTaskFixture,
  BenchmarkTaskResult,
  BenchmarkWorkspaceFixture,
} from "./types";
import { saveMemories } from "../storage/memory-store";

type CliOptions = {
  fixturePath: string;
  outputPath?: string;
  taskOutputDir?: string;
  strict: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const args = [...argv];
  const fixturePath = args.shift();
  if (!fixturePath) {
    throw new Error("Usage: node dist/eval/run-benchmark.js <fixture-path> [--output <path>] [--strict]");
  }

  let outputPath: string | undefined;
  let taskOutputDir: string | undefined;
  let strict = false;

  while (args.length > 0) {
    const flag = args.shift();
    if (flag === "--output") {
      outputPath = args.shift();
      if (!outputPath) throw new Error("Missing value for --output");
      continue;
    }
    if (flag === "--task-output-dir") {
      taskOutputDir = args.shift();
      if (!taskOutputDir) throw new Error("Missing value for --task-output-dir");
      continue;
    }
    if (flag === "--strict") {
      strict = true;
      continue;
    }
    throw new Error(`Unknown argument: ${flag}`);
  }

  return {
    fixturePath: path.resolve(fixturePath),
    outputPath: outputPath ? path.resolve(outputPath) : undefined,
    taskOutputDir: taskOutputDir ? path.resolve(taskOutputDir) : undefined,
    strict,
  };
}

function ensureWorkspace(baseDir: string, workspace: BenchmarkWorkspaceFixture): string {
  const workspaceRoot = path.join(baseDir, workspace.path);
  const packageDir =
    workspace.kind === "project"
      ? path.join(workspaceRoot, "packages", "app")
      : workspaceRoot;

  fs.mkdirSync(path.join(workspaceRoot, ".git"), { recursive: true });
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "package.json"), JSON.stringify({ name: workspace.id }));

  if (workspace.kind === "project") {
    fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({ name: `${workspace.id}-app` }));
  }

  return packageDir;
}

function buildFixtureMemory(
  fixture: BenchmarkMemoryFixture,
  workspaceCwds: Map<string, string>
): Memory {
  const now = Date.now();
  const scope = fixture.scope ?? (fixture.workspaceId ? "repo" : "global");
  const cwd = fixture.workspaceId ? workspaceCwds.get(fixture.workspaceId) : undefined;

  if (scope !== "global" && !cwd) {
    throw new Error(`Memory ${fixture.id} requires workspaceId for scope ${scope}`);
  }

  const scopeRef =
    scope === "global"
      ? { scope: "global" as const, scopeKey: "global", scopePath: undefined }
      : resolveWriteScope(inferScopeContext(cwd), scope);

  return {
    id: fixture.id,
    title: fixture.title,
    content: fixture.content,
    kind: fixture.kind,
    layer: fixture.layer ?? "fact",
    scope: scopeRef.scope,
    scopeKey: scopeRef.scopeKey,
    scopePath: scopeRef.scopePath,
    tags: fixture.tags ?? [],
    source: "derived",
    strength: fixture.strength ?? 0.8,
    accessCount: 0,
    lastAccessedAt: now,
    createdAt: now,
    updatedAt: now,
    stability: fixture.kind === "state" ? "volatile" : "stable",
    status: "active",
    reviewState: "approved",
    sensitivity: "safe",
    sensitivityReasons: [],
    restrictedToInbox: false,
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}

function evaluateTask(
  task: BenchmarkTaskFixture,
  selectedIds: string[],
  selectedScopeKeys: string[],
  result: Awaited<ReturnType<typeof recall>>,
  allowedScopeKeys: Set<string>
): BenchmarkTaskResult {
  const relevantIds = new Set(task.relevantMemoryIds);
  const keyIds = new Set(task.keyMemoryIds);
  const relevantSelectedIds = selectedIds.filter((id) => relevantIds.has(id));
  const keySelectedIds = selectedIds.filter((id) => keyIds.has(id));
  const crossProjectSelectedIds = selectedIds.filter((id, index) => {
    const scopeKey = selectedScopeKeys[index];
    if (scopeKey === "global") return false;
    if (allowedScopeKeys.has(scopeKey)) return false;
    return true;
  });

  const precision = selectedIds.length === 0 ? 0 : relevantSelectedIds.length / selectedIds.length;
  const coverage = keyIds.size === 0 ? 1 : keySelectedIds.length / keyIds.size;
  const contamination =
    selectedIds.length === 0 ? 0 : crossProjectSelectedIds.length / selectedIds.length;
  const recallToContextRatio =
    result.counts.selected === 0 ? 0 : result.counts.retrieved / result.counts.selected;

  const failures: string[] = [];
  if (task.targets?.minPrecision !== undefined && precision < task.targets.minPrecision) {
    failures.push(`precision=${precision.toFixed(4)} < ${task.targets.minPrecision}`);
  }
  if (task.targets?.minCoverage !== undefined && coverage < task.targets.minCoverage) {
    failures.push(`coverage=${coverage.toFixed(4)} < ${task.targets.minCoverage}`);
  }
  if (task.targets?.maxContamination !== undefined && contamination > task.targets.maxContamination) {
    failures.push(`contamination=${contamination.toFixed(4)} > ${task.targets.maxContamination}`);
  }
  if (task.targets?.minTokenSaved !== undefined && result.tokenEstimate.savedVsBaseline < task.targets.minTokenSaved) {
    failures.push(
      `tokenSaved=${result.tokenEstimate.savedVsBaseline} < ${task.targets.minTokenSaved}`
    );
  }

  return {
    id: task.id,
    projectId: task.projectId,
    query: task.query,
    selectedMemoryIds: selectedIds,
    relevantSelectedIds,
    crossProjectSelectedIds,
    projectRecallPrecision: roundMetric(precision),
    projectRecallCoverage: roundMetric(coverage),
    crossProjectContaminationRate: roundMetric(contamination),
    contextTokenSaved: result.tokenEstimate.savedVsBaseline,
    averageContextSizePerTask: result.tokenEstimate.selected,
    recallToContextRatio: roundMetric(recallToContextRatio),
    timeToResumeMs: null,
    targets: task.targets,
    passed: failures.length === 0,
    failures,
  };
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const fixture = JSON.parse(fs.readFileSync(options.fixturePath, "utf-8")) as BenchmarkFixture;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oazen-benchmark-"));
  const oazenHome = path.join(tempRoot, "oazen-home");
  const workspaceRoot = path.join(tempRoot, "workspace");

  fs.mkdirSync(oazenHome, { recursive: true });
  fs.mkdirSync(workspaceRoot, { recursive: true });
  process.env.OAZEN_HOME = oazenHome;

  const workspaceCwds = new Map<string, string>();
  for (const workspace of fixture.workspaces) {
    workspaceCwds.set(workspace.id, ensureWorkspace(workspaceRoot, workspace));
  }

  const seededMemories = fixture.memories.map((memory) => buildFixtureMemory(memory, workspaceCwds));
  await saveMemories(seededMemories);

  const taskResults: BenchmarkTaskResult[] = [];

  for (const task of fixture.tasks) {
    const cwd = workspaceCwds.get(task.workspaceId);
    if (!cwd) throw new Error(`Unknown workspaceId for task ${task.id}: ${task.workspaceId}`);

    const recallResult = await recall(task.query, {
      cwd,
      limit: task.limit ?? 5,
      updateAccess: false,
    });

    const selectedIds = recallResult.selected.map((memory) => memory.id);
    const selectedScopeKeys = recallResult.selected.map((memory) => memory.scopeKey);
    const scopeContext = inferScopeContext(cwd);
    const allowedScopeKeys = new Set<string>(
      [scopeContext.projectKey, scopeContext.repoKey].filter(
        (value): value is string => typeof value === "string"
      )
    );

    taskResults.push(
      evaluateTask(task, selectedIds, selectedScopeKeys, recallResult, allowedScopeKeys)
    );
  }

  const report: BenchmarkRunResult = {
    version: "1",
    kind: "benchmark_run_result",
    name: fixture.name,
    generatedAt: new Date().toISOString(),
    fixturePath: options.fixturePath,
    primaryMetrics: {
      projectRecallPrecision: roundMetric(average(taskResults.map((task) => task.projectRecallPrecision))),
      projectRecallCoverage: roundMetric(average(taskResults.map((task) => task.projectRecallCoverage))),
      crossProjectContaminationRate: roundMetric(
        average(taskResults.map((task) => task.crossProjectContaminationRate))
      ),
      contextTokenSaved: roundMetric(average(taskResults.map((task) => task.contextTokenSaved))),
      averageContextSizePerTask: roundMetric(
        average(taskResults.map((task) => task.averageContextSizePerTask))
      ),
      recallToContextRatio: roundMetric(average(taskResults.map((task) => task.recallToContextRatio))),
    },
    workflowMetrics: {
      timeToResumeMs: null,
      notes: [
        "Time to Resume is not auto-scored in this benchmark run.",
        "Use docs/BENCHMARKS.md for the human-in-the-loop resume benchmark flow.",
      ],
    },
    tasks: taskResults,
    passed: taskResults.every((task) => task.passed),
  };

  const serialized = JSON.stringify(report, null, 2);
  if (options.outputPath) {
    fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
    fs.writeFileSync(options.outputPath, serialized);
  }
  if (options.taskOutputDir) {
    fs.mkdirSync(options.taskOutputDir, { recursive: true });
    for (const task of taskResults) {
      const taskPath = path.join(options.taskOutputDir, `${task.id}.json`);
      fs.writeFileSync(taskPath, JSON.stringify(task, null, 2));
    }
  }

  console.log(serialized);

  if (options.strict && !report.passed) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
