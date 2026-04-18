#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SOURCE_DIR="${1:-$HOME/.codex/memories}"
REPORT_DIR="${2:-/tmp/oazen-codex-import-test-$(date +%Y%m%d-%H%M%S)}"
TEST_HOME="$REPORT_DIR/oazen-home"
BUCKET_DIR="$REPORT_DIR/buckets"
IMPORT_DIR="$REPORT_DIR/imports"
APPROVAL_DIR="$REPORT_DIR/approvals"
RECALL_DIR="$REPORT_DIR/project-recalls"

SUMMARY_FILE="$SOURCE_DIR/memory_summary.md"
RAW_FILE="$SOURCE_DIR/raw_memories.md"
GLOBAL_RECALL_QUERY="${RECALL_QUERY:-fix WeChat invite flow and verify with tests}"
APPROVE_LIMIT="${APPROVE_LIMIT:-3}"
STRICT_ASSERT="${STRICT_ASSERT:-0}"
MIN_PROJECT_RECALL_RETURNED="${MIN_PROJECT_RECALL_RETURNED:-1}"
MAX_GLOBAL_SCOPE_CREATED="${MAX_GLOBAL_SCOPE_CREATED:-0}"
MAX_SUSPICIOUS_NOISE="${MAX_SUSPICIOUS_NOISE:-0}"
REQUIRE_ALL_BUCKETS_RECALLED="${REQUIRE_ALL_BUCKETS_RECALLED:-1}"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Source directory not found: $SOURCE_DIR" >&2
  exit 1
fi

if [[ ! -f "$SUMMARY_FILE" && ! -f "$RAW_FILE" ]]; then
  echo "No supported memory source files found in: $SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$REPORT_DIR" "$TEST_HOME" "$BUCKET_DIR" "$IMPORT_DIR" "$APPROVAL_DIR" "$RECALL_DIR"

echo "== Oazen Codex Memory Import Test =="
echo "Project root: $PROJECT_ROOT"
echo "Source dir: $SOURCE_DIR"
echo "Report dir: $REPORT_DIR"
echo "Test OAZEN_HOME: $TEST_HOME"
echo "Approve limit per project: $APPROVE_LIMIT"
if [[ "$STRICT_ASSERT" == "1" ]]; then
  echo "Quality assert mode: enabled"
  echo "Min per-project recall returned: $MIN_PROJECT_RECALL_RETURNED"
  echo "Max global-scope created: $MAX_GLOBAL_SCOPE_CREATED"
  echo "Max suspicious noise count: $MAX_SUSPICIOUS_NOISE"
  echo "Require all buckets recalled: $REQUIRE_ALL_BUCKETS_RECALLED"
else
  echo "Quality assert mode: disabled"
fi
echo

cd "$PROJECT_ROOT"
npm run build >/dev/null

run_oazen() {
  OAZEN_HOME="$TEST_HOME" node dist/index.js "$@"
}

echo "== Stage 1: Bucketed Import =="
echo "-- Bucketing source memories by cwd"
node "$PROJECT_ROOT/scripts/codex-memory-bucket.js" "$SOURCE_DIR" "$BUCKET_DIR" > "$REPORT_DIR/buckets.json"

while IFS=$'\t' read -r bucket_slug bucket_cwd bucket_summary bucket_raw; do
  echo "-- Importing bucket: $bucket_cwd"

  if [[ "$bucket_summary" != "-" ]]; then
    run_oazen writeback --file "$bucket_summary" --cwd "$bucket_cwd" > "$IMPORT_DIR/${bucket_slug}-memory-summary.json"
  fi

  if [[ "$bucket_raw" != "-" ]]; then
    run_oazen writeback --file "$bucket_raw" --cwd "$bucket_cwd" > "$IMPORT_DIR/${bucket_slug}-raw-memories.json"
  fi
done < <(
  node - "$BUCKET_DIR/manifest.json" <<'EOF'
const fs = require("fs");

const manifest = JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));
for (const bucket of manifest) {
  process.stdout.write(
    [
      bucket.slug,
      bucket.cwd,
      bucket.summaryPath ?? "-",
      bucket.rawPath ?? "-",
    ].join("\t") + "\n"
  );
}
EOF
)

echo "-- Capturing stage 1 review output"
run_oazen review > "$REPORT_DIR/review-stage1.json"

echo
echo "== Stage 2: Auto Approve / Promote / Per-Project Recall =="
node - "$REPORT_DIR" "$APPROVE_LIMIT" <<'EOF' > "$REPORT_DIR/stage2-plan.json"
const fs = require("fs");
const path = require("path");

const reportDir = process.argv[2];
const approveLimit = Number(process.argv[3] ?? "3");
const bucketManifest = JSON.parse(fs.readFileSync(path.join(reportDir, "buckets.json"), "utf-8"));
const review = JSON.parse(fs.readFileSync(path.join(reportDir, "review-stage1.json"), "utf-8"));
const importDir = path.join(reportDir, "imports");

function suspiciousNoise(content) {
  if (!content) return true;
  const trimmed = content.trim();
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (/^(Preference signals|Reusable knowledge|Failures and how to do differently|References):?$/i.test(trimmed)) return true;
  if (/^(task|task_group|task_outcome|cwd|updated_at|rollout_path|rollout_summary_file):/i.test(trimmed)) return true;
  return false;
}

const scopeBySlug = new Map();
for (const fileName of fs.readdirSync(importDir).filter((name) => name.endsWith(".json"))) {
  const payload = JSON.parse(fs.readFileSync(path.join(importDir, fileName), "utf-8"));
  const slug = fileName
    .replace(/-memory-summary\.json$/, "")
    .replace(/-raw-memories\.json$/, "");

  if (payload.scope?.inferredScopeKey) {
    scopeBySlug.set(slug, payload.scope.inferredScopeKey);
  }
}

const plan = bucketManifest.map((bucket) => {
  const scopeKey = scopeBySlug.get(bucket.slug) ?? "";
  const eligible = review.items
    .filter((item) => item.scopeKey === scopeKey)
    .filter((item) => !item.restrictedToInbox && item.sensitivity === "safe")
    .filter((item) => ["fact", "workflow", "preference"].includes(item.kind))
    .filter((item) => item.content.length >= 30)
    .filter((item) => !suspiciousNoise(item.content))
    .slice(0, approveLimit);

  const query =
    eligible[0]?.content
      ?.replace(/^-\s+/, "")
      .replace(/[`"]/g, "")
      .slice(0, 180) || `project memory recall for ${path.basename(bucket.cwd)}`;

  return {
    slug: bucket.slug,
    cwd: bucket.cwd,
    scopeKey,
    query,
    ids: eligible.map((item) => item.id),
  };
});

process.stdout.write(JSON.stringify(plan, null, 2));
EOF

while IFS=$'\t' read -r bucket_slug bucket_cwd bucket_query; do
  echo "-- Project bucket: $bucket_cwd"

  printf '%s\n' "$bucket_query" > "$APPROVAL_DIR/${bucket_slug}-query.txt"
  node - "$REPORT_DIR/stage2-plan.json" "$bucket_slug" <<'EOF' > "$APPROVAL_DIR/${bucket_slug}-selected-ids.txt"
const fs = require("fs");

const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));
const bucket = plan.find((entry) => entry.slug === process.argv[3]);
for (const id of bucket?.ids ?? []) {
  process.stdout.write(`${id}\n`);
}
EOF

  if [[ ! -s "$APPROVAL_DIR/${bucket_slug}-selected-ids.txt" ]]; then
    echo "   no eligible candidates found"
    continue
  fi

  while IFS= read -r memory_id; do
    [[ -z "$memory_id" ]] && continue
    run_oazen approve "$memory_id" > "$APPROVAL_DIR/${bucket_slug}-approve-${memory_id}.json"
    run_oazen promote "$memory_id" > "$APPROVAL_DIR/${bucket_slug}-promote-${memory_id}.json"
  done < "$APPROVAL_DIR/${bucket_slug}-selected-ids.txt"

  run_oazen recall "$bucket_query" --cwd "$bucket_cwd" > "$RECALL_DIR/${bucket_slug}.json"
  run_oazen recall "$bucket_query" --cwd "$bucket_cwd" --format codex > "$RECALL_DIR/${bucket_slug}.txt"
done < <(
  node - "$REPORT_DIR/stage2-plan.json" <<'EOF'
const fs = require("fs");

const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));
for (const bucket of plan) {
  process.stdout.write(
    [
      bucket.slug,
      bucket.cwd,
      bucket.query.replace(/\t/g, " "),
    ].join("\t") + "\n"
  );
}
EOF
)

echo "-- Capturing final review output"
run_oazen review > "$REPORT_DIR/review-stage2.json"

echo "-- Capturing global recall output"
run_oazen recall "$GLOBAL_RECALL_QUERY" > "$REPORT_DIR/recall.json"
run_oazen recall "$GLOBAL_RECALL_QUERY" --format codex > "$REPORT_DIR/recall-codex.txt"

echo "-- Building summary"
node - "$REPORT_DIR" <<'EOF'
const fs = require("fs");
const path = require("path");

const reportDir = process.argv[2];

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function readJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({
      name,
      payload: JSON.parse(fs.readFileSync(path.join(dirPath, name), "utf-8")),
    }));
}

function suspiciousNoise(content) {
  if (!content) return false;
  const trimmed = content.trim();
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (/^(Preference signals|Reusable knowledge|Failures and how to do differently|References):?$/i.test(trimmed)) return true;
  if (/^(task|task_group|task_outcome|cwd|updated_at|rollout_path|rollout_summary_file):/i.test(trimmed)) return true;
  if (/^[`"'()[\]{}:;/\\._\-\s]+$/.test(trimmed)) return true;
  return false;
}

const bucketManifest = readJsonIfExists(path.join(reportDir, "buckets.json")) ?? [];
const stage2Plan = readJsonIfExists(path.join(reportDir, "stage2-plan.json")) ?? [];
const importResults = readJsonFiles(path.join(reportDir, "imports"));
const approvalResults = readJsonFiles(path.join(reportDir, "approvals"));
const projectRecallResults = readJsonFiles(path.join(reportDir, "project-recalls")).filter((entry) =>
  entry.name.endsWith(".json")
);
const reviewStage1 = readJsonIfExists(path.join(reportDir, "review-stage1.json"));
const reviewStage2 = readJsonIfExists(path.join(reportDir, "review-stage2.json"));
const globalRecall = readJsonIfExists(path.join(reportDir, "recall.json"));

const createdChanges = importResults
  .flatMap((result) => result.payload.changes ?? [])
  .filter((change) => !change.before && change.after);
const createdMemories = createdChanges.map((change) => change.after);

const scopeBreakdown = createdMemories.reduce((acc, memory) => {
  const key = `${memory.scope}:${memory.scopeKey}`;
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});

const suspicious = (reviewStage1?.items ?? [])
  .filter((item) => suspiciousNoise(item.content))
  .slice(0, 20)
  .map((item) => ({
    id: item.id,
    kind: item.kind,
    content: item.content,
  }));

const importBreakdown = importResults.map((result) => ({
  name: result.name,
  created: result.payload.counts?.created ?? 0,
  changed: result.payload.counts?.changed ?? 0,
  blocked: result.payload.counts?.blocked ?? 0,
  scope: result.payload.scope ?? null,
}));

const approvalBreakdown = approvalResults.map((result) => ({
  name: result.name,
  action: result.payload.action,
  changed: result.payload.counts?.changed ?? 0,
}));

const projectRecalls = projectRecallResults.map((result) => ({
  name: result.name,
  returned: result.payload.memories?.length ?? 0,
  topMemoryIds: (result.payload.memories ?? []).slice(0, 5).map((memory) => memory.id),
}));

const report = {
  generatedAt: new Date().toISOString(),
  buckets: {
    total: bucketManifest.length,
    items: bucketManifest.map((bucket) => ({
      cwd: bucket.cwd,
      slug: bucket.slug,
      summarySections: bucket.summarySections,
      rawSections: bucket.rawSections,
    })),
  },
  stage1: {
    imports: importBreakdown,
    review: reviewStage1
      ? {
          total: reviewStage1.counts.total,
          safe: reviewStage1.counts.safe,
          review: reviewStage1.counts.review,
          restricted: reviewStage1.counts.restricted,
        }
      : null,
    createdMemoryCount: createdMemories.length,
    scopeBreakdown,
    suspiciousNoiseCount: suspicious.length,
    suspiciousNoiseSamples: suspicious,
  },
  stage2: {
    plan: stage2Plan,
    approvals: approvalBreakdown,
    finalReview: reviewStage2
      ? {
          total: reviewStage2.counts.total,
          safe: reviewStage2.counts.safe,
          review: reviewStage2.counts.review,
          restricted: reviewStage2.counts.restricted,
        }
      : null,
    projectRecalls,
  },
  globalRecall: globalRecall
    ? {
        returned: globalRecall.memories.length,
        topMemoryIds: globalRecall.memories.slice(0, 5).map((memory) => memory.id),
      }
    : null,
};

fs.writeFileSync(path.join(reportDir, "summary.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
EOF

if [[ "$STRICT_ASSERT" == "1" ]]; then
  echo "-- Running quality assertions"
  node - \
    "$REPORT_DIR" \
    "$MIN_PROJECT_RECALL_RETURNED" \
    "$MAX_GLOBAL_SCOPE_CREATED" \
    "$MAX_SUSPICIOUS_NOISE" \
    "$REQUIRE_ALL_BUCKETS_RECALLED" <<'EOF'
const fs = require("fs");
const path = require("path");

const reportDir = process.argv[2];
const minProjectRecallReturned = Number(process.argv[3] ?? "1");
const maxGlobalScopeCreated = Number(process.argv[4] ?? "0");
const maxSuspiciousNoise = Number(process.argv[5] ?? "0");
const requireAllBucketsRecalled = process.argv[6] !== "0";

const summaryPath = path.join(reportDir, "summary.json");
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));

const globalScopeCreated = Object.entries(summary.stage1?.scopeBreakdown ?? {})
  .filter(([key]) => key.startsWith("global:"))
  .reduce((total, [, count]) => total + Number(count ?? 0), 0);

const recallBySlug = new Map(
  (summary.stage2?.projectRecalls ?? []).map((entry) => [
    entry.name.replace(/\.json$/, ""),
    Number(entry.returned ?? 0),
  ])
);

const plan = summary.stage2?.plan ?? [];
const missingRecallBuckets = plan
  .filter((bucket) => {
    if (!bucket.ids?.length) {
      return false;
    }
    return !recallBySlug.has(bucket.slug);
  })
  .map((bucket) => bucket.slug);

const underfilledRecallBuckets = plan
  .filter((bucket) => {
    if (!bucket.ids?.length) {
      return false;
    }
    return (recallBySlug.get(bucket.slug) ?? 0) < minProjectRecallReturned;
  })
  .map((bucket) => ({
    slug: bucket.slug,
    returned: recallBySlug.get(bucket.slug) ?? 0,
  }));

const failures = [];

if (globalScopeCreated > maxGlobalScopeCreated) {
  failures.push(
    `global scope leak detected: created=${globalScopeCreated}, max=${maxGlobalScopeCreated}`
  );
}

if ((summary.stage1?.suspiciousNoiseCount ?? 0) > maxSuspiciousNoise) {
  failures.push(
    `suspicious noise exceeded threshold: count=${summary.stage1?.suspiciousNoiseCount ?? 0}, max=${maxSuspiciousNoise}`
  );
}

if (requireAllBucketsRecalled && missingRecallBuckets.length > 0) {
  failures.push(
    `missing per-project recall outputs for buckets: ${missingRecallBuckets.join(", ")}`
  );
}

if (underfilledRecallBuckets.length > 0) {
  failures.push(
    `per-project recall below threshold: ${underfilledRecallBuckets
      .map((bucket) => `${bucket.slug}=${bucket.returned}`)
      .join(", ")}`
  );
}

const assertionReport = {
  strictAssert: true,
  passed: failures.length === 0,
  thresholds: {
    minProjectRecallReturned,
    maxGlobalScopeCreated,
    maxSuspiciousNoise,
    requireAllBucketsRecalled,
  },
  observed: {
    globalScopeCreated,
    suspiciousNoiseCount: summary.stage1?.suspiciousNoiseCount ?? 0,
    projectRecallReturned: Object.fromEntries(recallBySlug),
  },
  failures,
};

const outputPath = path.join(reportDir, "quality-assertions.json");
fs.writeFileSync(outputPath, JSON.stringify(assertionReport, null, 2));
console.log(JSON.stringify(assertionReport, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
EOF
fi

echo
echo "Artifacts written to: $REPORT_DIR"
echo "- buckets.json"
echo "- buckets/manifest.json"
echo "- imports/*.json"
echo "- stage2-plan.json"
echo "- approvals/*"
echo "- project-recalls/*"
echo "- review-stage1.json"
echo "- review-stage2.json"
echo "- recall.json"
echo "- recall-codex.txt"
echo "- summary.json"
if [[ "$STRICT_ASSERT" == "1" ]]; then
  echo "- quality-assertions.json"
fi
