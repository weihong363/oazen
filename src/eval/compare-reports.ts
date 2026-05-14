import fs from "fs";
import path from "path";
import {
  BenchmarkCompareResult,
  BenchmarkMetricComparison,
  BenchmarkRunResult,
  BenchmarkTaskComparisonResult,
  BenchmarkTaskResult,
} from "./types";

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildComparison(
  baseline: number | null,
  oazen: number | null
): BenchmarkMetricComparison {
  return {
    baseline,
    oazen,
    delta: baseline === null || oazen === null ? null : roundMetric(oazen - baseline),
  };
}

function scoreComparison(
  comparison: BenchmarkMetricComparison,
  direction: "higher" | "lower"
): number {
  if (comparison.delta === null || comparison.delta === 0) return 0;
  if (direction === "higher") return comparison.delta > 0 ? 1 : -1;
  return comparison.delta < 0 ? 1 : -1;
}

function buildVerdict(scores: number[]): "better" | "neutral" | "worse" {
  const total = scores.reduce((sum, score) => sum + score, 0);
  if (total > 0) return "better";
  if (total < 0) return "worse";
  return "neutral";
}

function readTaskMap(tasks: BenchmarkTaskResult[]): Map<string, BenchmarkTaskResult> {
  return new Map(tasks.map((task) => [task.id, task]));
}

function buildTaskComparison(
  baselineTask: BenchmarkTaskResult | undefined,
  oazenTask: BenchmarkTaskResult | undefined,
  id: string
): BenchmarkTaskComparisonResult {
  const precision = buildComparison(
    readNumber(baselineTask?.projectRecallPrecision),
    readNumber(oazenTask?.projectRecallPrecision)
  );
  const coverage = buildComparison(
    readNumber(baselineTask?.projectRecallCoverage),
    readNumber(oazenTask?.projectRecallCoverage)
  );
  const contamination = buildComparison(
    readNumber(baselineTask?.crossProjectContaminationRate),
    readNumber(oazenTask?.crossProjectContaminationRate)
  );
  const tokenSavings = buildComparison(
    readNumber(baselineTask?.contextTokenSaved),
    readNumber(oazenTask?.contextTokenSaved)
  );

  return {
    id,
    query: baselineTask?.query ?? oazenTask?.query ?? null,
    baselineMetrics: {
      projectRecallPrecision: precision.baseline,
      projectRecallCoverage: coverage.baseline,
      crossProjectContaminationRate: contamination.baseline,
      contextTokenSaved: tokenSavings.baseline,
    },
    oazenMetrics: {
      projectRecallPrecision: precision.oazen,
      projectRecallCoverage: coverage.oazen,
      crossProjectContaminationRate: contamination.oazen,
      contextTokenSaved: tokenSavings.oazen,
    },
    tokenSavingsComparison: tokenSavings,
    recallPrecisionComparison: precision,
    recallCoverageComparison: coverage,
    scopeContaminationComparison: contamination,
    writeback: null,
    verdict: buildVerdict([
      scoreComparison(precision, "higher"),
      scoreComparison(coverage, "higher"),
      scoreComparison(contamination, "lower"),
      scoreComparison(tokenSavings, "higher"),
    ]),
  };
}

function parseBenchmarkRunResult(filePath: string): BenchmarkRunResult {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<BenchmarkRunResult>;
  if (raw.kind !== "benchmark_run_result") {
    throw new Error(`Expected benchmark_run_result at ${filePath}`);
  }
  return raw as BenchmarkRunResult;
}

export function compareBenchmarkReports(
  baselineReportPath: string,
  oazenReportPath: string
): BenchmarkCompareResult {
  const resolvedBaselinePath = path.resolve(baselineReportPath);
  const resolvedOazenPath = path.resolve(oazenReportPath);
  const baseline = parseBenchmarkRunResult(resolvedBaselinePath);
  const oazen = parseBenchmarkRunResult(resolvedOazenPath);

  const precision = buildComparison(
    readNumber(baseline.primaryMetrics?.projectRecallPrecision),
    readNumber(oazen.primaryMetrics?.projectRecallPrecision)
  );
  const coverage = buildComparison(
    readNumber(baseline.primaryMetrics?.projectRecallCoverage),
    readNumber(oazen.primaryMetrics?.projectRecallCoverage)
  );
  const contamination = buildComparison(
    readNumber(baseline.primaryMetrics?.crossProjectContaminationRate),
    readNumber(oazen.primaryMetrics?.crossProjectContaminationRate)
  );
  const tokenSavings = buildComparison(
    readNumber(baseline.primaryMetrics?.contextTokenSaved),
    readNumber(oazen.primaryMetrics?.contextTokenSaved)
  );

  const baselineTaskMap = readTaskMap(baseline.tasks ?? []);
  const oazenTaskMap = readTaskMap(oazen.tasks ?? []);
  const taskIds = [...new Set([...baselineTaskMap.keys(), ...oazenTaskMap.keys()])].sort();

  return {
    version: "1",
    kind: "benchmark_compare_result",
    generatedAt: new Date().toISOString(),
    baselineReportPath: resolvedBaselinePath,
    oazenReportPath: resolvedOazenPath,
    fixtureName: baseline.name ?? oazen.name ?? null,
    baselineMetrics: baseline.primaryMetrics ?? null,
    oazenMetrics: oazen.primaryMetrics ?? null,
    tokenSavingsComparison: tokenSavings,
    recallPrecisionComparison: precision,
    recallCoverageComparison: coverage,
    scopeContaminationComparison: contamination,
    writeback: null,
    verdict: buildVerdict([
      scoreComparison(precision, "higher"),
      scoreComparison(coverage, "higher"),
      scoreComparison(contamination, "lower"),
      scoreComparison(tokenSavings, "higher"),
    ]),
    tasks: taskIds.map((id) =>
      buildTaskComparison(baselineTaskMap.get(id), oazenTaskMap.get(id), id)
    ),
  };
}
