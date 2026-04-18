import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = path.resolve(process.cwd());
const benchmarkRunnerPath = path.join(repoRoot, "dist", "eval", "run-benchmark.js");
const fixturePath = path.join(repoRoot, "fixtures", "benchmark", "tasks.json");

test("benchmark runner reports project precision and zero contamination for fixture set", () => {
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
  assert.ok(report.primaryMetrics.recallToContextRatio > 1);
});
