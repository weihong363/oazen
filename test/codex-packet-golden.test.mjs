import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const repoRoot = path.resolve(process.cwd());
const fixturesDir = path.join(repoRoot, "test", "fixtures", "codex-packet");
const require = createRequire(import.meta.url);
const { formatCodexContextPacket } = require(path.join(repoRoot, "dist", "adapters", "codex.js"));

function readJson(name) {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), "utf-8"));
}

function readText(name) {
  return readFileSync(path.join(fixturesDir, name), "utf-8").trimEnd();
}

test("codex packet renderer matches populated golden output", () => {
  const input = readJson("populated-input.json");
  const actual = formatCodexContextPacket(input);
  const expected = readText("populated-output.txt");

  assert.equal(actual, expected);
});

test("codex packet renderer matches empty golden output", () => {
  const input = readJson("empty-input.json");
  const actual = formatCodexContextPacket(input);
  const expected = readText("empty-output.txt");

  assert.equal(actual, expected);
});
