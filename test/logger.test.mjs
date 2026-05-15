import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { logOazenEvent } = require("../dist/utils/logger.js");

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
    if (previousHome === undefined) {
      delete process.env.OAZEN_HOME;
    } else {
      process.env.OAZEN_HOME = previousHome;
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
