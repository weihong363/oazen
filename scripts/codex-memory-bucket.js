#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const sourceDir = process.argv[2];
const outputDir = process.argv[3];

if (!sourceDir || !outputDir) {
  console.error("Usage: node scripts/codex-memory-bucket.js <source-dir> <output-dir>");
  process.exit(1);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function slugifyCwd(cwd) {
  return cwd
    .replace(/^\/+/, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-");
}

function getBucket(buckets, cwd) {
  if (!buckets.has(cwd)) {
    buckets.set(cwd, {
      cwd,
      slug: slugifyCwd(cwd),
      summaryParts: [],
      rawParts: [],
    });
  }

  return buckets.get(cwd);
}

function parseMemorySummary(filePath, buckets) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  let currentCwd = null;

  for (const line of lines) {
    const match = line.match(/^### (\/Users\/.+)$/);
    if (match) {
      currentCwd = match[1].trim();
      getBucket(buckets, currentCwd).summaryParts.push(line);
      continue;
    }

    if (currentCwd) {
      getBucket(buckets, currentCwd).summaryParts.push(line);
    }
  }
}

function parseRawMemories(filePath, buckets) {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, "utf-8");
  const sections = raw.split(/(?=^## Thread )/m).filter(Boolean);

  for (const section of sections) {
    const match = section.match(/^cwd:\s+(\/Users\/.+)$/m);
    if (!match) continue;

    getBucket(buckets, match[1].trim()).rawParts.push(section.trimEnd());
  }
}

function writeBuckets(outputDir, buckets) {
  ensureDir(outputDir);
  const manifest = [];

  for (const bucket of buckets.values()) {
    const bucketDir = path.join(outputDir, bucket.slug);
    ensureDir(bucketDir);

    const summaryPath =
      bucket.summaryParts.length > 0 ? path.join(bucketDir, "memory_summary.md") : null;
    const rawPath =
      bucket.rawParts.length > 0 ? path.join(bucketDir, "raw_memories.md") : null;

    if (summaryPath) {
      fs.writeFileSync(summaryPath, `${bucket.summaryParts.join("\n").trim()}\n`, "utf-8");
    }

    if (rawPath) {
      fs.writeFileSync(rawPath, `${bucket.rawParts.join("\n\n").trim()}\n`, "utf-8");
    }

    manifest.push({
      cwd: bucket.cwd,
      slug: bucket.slug,
      summaryPath,
      rawPath,
      summarySections: bucket.summaryParts.length > 0 ? 1 : 0,
      rawSections: bucket.rawParts.length,
    });
  }

  manifest.sort((a, b) => a.cwd.localeCompare(b.cwd));
  return manifest;
}

const buckets = new Map();
parseMemorySummary(path.join(sourceDir, "memory_summary.md"), buckets);
parseRawMemories(path.join(sourceDir, "raw_memories.md"), buckets);

const manifest = writeBuckets(outputDir, buckets);
fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
