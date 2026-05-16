import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { logOazenEvent } = require("../dist/utils/logger.js");

function restoreEnv(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test("logOazenEvent writes UTC and local timestamp fields", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-logger-"));
  const previousHome = process.env.OAZEN_HOME;

  try {
    process.env.OAZEN_HOME = tempRoot;

    await logOazenEvent({
      action: "test",
      timestamp: "external-timestamp",
      localTimestamp: "external-local-timestamp",
    });

    const logPath = path.join(tempRoot, "logs", "oazen.log");
    const record = JSON.parse(readFileSync(logPath, "utf-8").trim());

    assert.equal(record.action, "test");
    assert.notEqual(record.timestamp, "external-timestamp");
    assert.notEqual(record.localTimestamp, "external-local-timestamp");
    assert.match(record.timestamp, /^\d{4}-\d{2}-\d{2}T.*Z$/);
    assert.match(record.localTimestamp, /^\d{4}-\d{2}-\d{2}T.*[+-]\d{2}:\d{2}$/);
    assert.equal(typeof record.timeZone, "string");
  } finally {
    restoreEnv({ OAZEN_HOME: previousHome });
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("logOazenEvent rotates logs with date suffixes, retention, and redaction", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-log-rotation-"));
  const previous = {
    OAZEN_HOME: process.env.OAZEN_HOME,
    OAZEN_LOG_MAX_BYTES: process.env.OAZEN_LOG_MAX_BYTES,
    OAZEN_LOG_RETENTION_FILES: process.env.OAZEN_LOG_RETENTION_FILES,
  };

  try {
    process.env.OAZEN_HOME = tempRoot;
    process.env.OAZEN_LOG_MAX_BYTES = "80";
    process.env.OAZEN_LOG_RETENTION_FILES = "2";

    const logDir = path.join(tempRoot, "logs");
    const logPath = path.join(logDir, "oazen.log");
    mkdirSync(logDir, { recursive: true });

    for (let index = 0; index < 4; index++) {
      writeFileSync(logPath, `secret=super-secret-${index}\n${"x".repeat(90)}`, "utf-8");
      await logOazenEvent({ event: "rotation-test", index, token: "ghp-abcdefghijklmnopqrstuvwxyz" });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const files = readdirSync(logDir).sort();
    const archives = files.filter((file) => /^oazen\.\d{4}-\d{2}-\d{2}T.*Z(?:\.\d+)?\.log$/.test(file));
    const current = readFileSync(logPath, "utf-8");
    const archivedText = archives.map((file) => readFileSync(path.join(logDir, file), "utf-8")).join("\n");

    assert.equal(archives.length, 2);
    assert.ok(files.includes("oazen.log"));
    assert.match(current, /"event":"rotation-test"/);
    assert.doesNotMatch(current, /ghp-abcdefghijklmnopqrstuvwxyz/);
    assert.doesNotMatch(archivedText, /super-secret/);
    assert.match(archivedText, /\[redacted-secret\]/);
  } finally {
    restoreEnv(previous);
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
