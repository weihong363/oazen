import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = path.resolve(process.cwd());
const cliPath = path.join(repoRoot, "dist", "index.js");

function writeReport(tempRoot, name, overrides = {}) {
  const reportPath = path.join(tempRoot, `${name}.json`);
  const report = {
    version: "1",
    kind: "benchmark_run_result",
    name: "ab-fixture",
    generatedAt: "2026-04-21T00:00:00.000Z",
    fixturePath: "/tmp/fixture.json",
    primaryMetrics: {
      projectRecallPrecision: 0.6,
      projectRecallCoverage: 0.5,
      crossProjectContaminationRate: 0.2,
      contextTokenSaved: 80,
      averageContextSizePerTask: 120,
      recallToContextRatio: 1.2,
    },
    workflowMetrics: {
      timeToResumeMs: null,
      notes: [],
    },
    tasks: [
      {
        id: "task-a",
        projectId: "project-a",
        query: "fix parser retries",
        selectedMemoryIds: ["m1"],
        relevantSelectedIds: ["m1"],
        crossProjectSelectedIds: [],
        projectRecallPrecision: 0.6,
        projectRecallCoverage: 0.5,
        crossProjectContaminationRate: 0.2,
        contextTokenSaved: 80,
        averageContextSizePerTask: 120,
        recallToContextRatio: 1.2,
        timeToResumeMs: null,
        targets: {},
        passed: true,
        failures: [],
      },
    ],
    passed: true,
    ...overrides,
  };

  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

test("eval compare loads two benchmark reports and emits deterministic comparison JSON", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-benchmark-compare-"));
  const baselinePath = writeReport(tempRoot, "baseline");
  const oazenPath = writeReport(tempRoot, "oazen", {
    primaryMetrics: {
      projectRecallPrecision: 0.8,
      projectRecallCoverage: 0.7,
      crossProjectContaminationRate: 0.1,
      contextTokenSaved: 140,
      averageContextSizePerTask: 100,
      recallToContextRatio: 1.6,
    },
    tasks: [
      {
        id: "task-a",
        projectId: "project-a",
        query: "fix parser retries",
        selectedMemoryIds: ["m1", "m2"],
        relevantSelectedIds: ["m1", "m2"],
        crossProjectSelectedIds: [],
        projectRecallPrecision: 0.8,
        projectRecallCoverage: 0.7,
        crossProjectContaminationRate: 0.1,
        contextTokenSaved: 140,
        averageContextSizePerTask: 100,
        recallToContextRatio: 1.6,
        timeToResumeMs: null,
        targets: {},
        passed: true,
        failures: [],
      },
    ],
  });

  const result = spawnSync("node", [cliPath, "eval", "compare", baselinePath, oazenPath], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.kind, "benchmark_compare_result");
  assert.equal(report.fixtureName, "ab-fixture");
  assert.equal(report.verdict, "better");
  assert.equal(report.baselineReportPath, baselinePath);
  assert.equal(report.oazenReportPath, oazenPath);
  assert.equal(report.tokenSavingsComparison.baseline, 80);
  assert.equal(report.tokenSavingsComparison.oazen, 140);
  assert.equal(report.tokenSavingsComparison.delta, 60);
  assert.equal(report.recallPrecisionComparison.delta, 0.2);
  assert.equal(report.recallCoverageComparison.delta, 0.2);
  assert.equal(report.scopeContaminationComparison.delta, -0.1);
  assert.equal(report.writeback, null);
  assert.equal(report.tasks.length, 1);
  assert.equal(report.tasks[0].id, "task-a");
  assert.equal(report.tasks[0].verdict, "better");
  assert.equal(report.tasks[0].writeback, null);

  rmSync(tempRoot, { recursive: true, force: true });
});

test("eval compare returns null for unavailable metrics instead of guessing", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-benchmark-compare-null-"));
  const baselinePath = writeReport(tempRoot, "baseline-null", {
    primaryMetrics: {
      projectRecallPrecision: 0.6,
      projectRecallCoverage: 0.5,
      crossProjectContaminationRate: 0.2,
      contextTokenSaved: 80,
      averageContextSizePerTask: 120,
      recallToContextRatio: 1.2,
    },
    tasks: [],
  });
  const oazenPath = writeReport(tempRoot, "oazen-null", {
    primaryMetrics: {
      projectRecallPrecision: 0.7,
      projectRecallCoverage: undefined,
      crossProjectContaminationRate: undefined,
      contextTokenSaved: 100,
      averageContextSizePerTask: 110,
      recallToContextRatio: 1.3,
    },
    tasks: [
      {
        id: "task-b",
        projectId: "project-b",
        query: "resume auth work",
        selectedMemoryIds: ["m9"],
        relevantSelectedIds: ["m9"],
        crossProjectSelectedIds: [],
        projectRecallPrecision: 0.7,
        projectRecallCoverage: undefined,
        crossProjectContaminationRate: undefined,
        contextTokenSaved: 100,
        averageContextSizePerTask: 110,
        recallToContextRatio: 1.3,
        timeToResumeMs: null,
        targets: {},
        passed: true,
        failures: [],
      },
    ],
  });

  const result = spawnSync("node", [cliPath, "eval", "compare", baselinePath, oazenPath], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.recallCoverageComparison.oazen, null);
  assert.equal(report.recallCoverageComparison.delta, null);
  assert.equal(report.scopeContaminationComparison.oazen, null);
  assert.equal(report.scopeContaminationComparison.delta, null);
  assert.equal(report.tasks.length, 1);
  assert.equal(report.tasks[0].id, "task-b");
  assert.equal(report.tasks[0].baselineMetrics.projectRecallCoverage, null);
  assert.equal(report.tasks[0].oazenMetrics.projectRecallCoverage, null);
  assert.equal(report.tasks[0].scopeContaminationComparison.oazen, null);

  rmSync(tempRoot, { recursive: true, force: true });
});

test("benchmark runner behavior stays intact after adding eval compare", () => {
  const benchmarkRunnerPath = path.join(repoRoot, "dist", "eval", "run-benchmark.js");
  const fixturePath = path.join(repoRoot, "fixtures", "benchmark", "tasks.json");
  const result = spawnSync("node", [benchmarkRunnerPath, fixturePath, "--strict"], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.kind, "benchmark_run_result");
  assert.equal(report.passed, true);
  assert.equal(report.tasks.length, 5);
  assert.ok(report.primaryMetrics.projectRecallPrecision >= 0.75);
  assert.equal(report.primaryMetrics.crossProjectContaminationRate, 0);
  assert.ok(report.primaryMetrics.contextTokenSaved > 0);
});
