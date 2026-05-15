import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createRequire } from "node:module";

const repoRoot = path.resolve(process.cwd());
const cliPath = path.join(repoRoot, "dist", "index.js");
const require = createRequire(import.meta.url);
const { ProjectResolver } = require("../dist/project/ProjectResolver.js");
const { MemoryStore } = require("../dist/memory/MemoryStore.js");
const { MemoryRetriever } = require("../dist/memory/MemoryRetriever.js");

function runCli(args, options = {}) {
  const result = spawnSync("node", [cliPath, ...args], {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
    input: options.input,
    encoding: "utf-8",
  });

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(result.stderr || result.stdout || `CLI failed with status ${result.status}`);
  }

  return {
    status: result.status ?? 0,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function makeProject(root, name) {
  const project = path.join(root, name);
  mkdirSync(project, { recursive: true });
  writeFileSync(path.join(project, "package.json"), JSON.stringify({ name }));
  return project;
}

function makeRecord(id, projectId, type, content, updatedAt, confidence, extra = {}) {
  return {
    id,
    projectId,
    type,
    content,
    source: "manual",
    confidence,
    createdAt: updatedAt,
    updatedAt,
    lastAccessedAt: updatedAt,
    tags: [],
    relatedFiles: [],
    ...extra,
  };
}

function hook(event, payload, env) {
  return JSON.parse(
    runCli(["hook", "codex", event], {
      env,
      input: JSON.stringify(payload),
    }).stdout
  );
}

test("Codex hooks fail open and write compact project-scoped memory", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-hooks-"));
  const env = { OAZEN_HOME: path.join(tempRoot, "home") };
  const projectA = makeProject(tempRoot, "project-a");
  const projectB = makeProject(tempRoot, "project-b");

  const malformed = runCli(["hook", "codex", "user-prompt-submit"], {
    env,
    input: "{bad json",
  });
  const malformedOutput = JSON.parse(malformed.stdout);
  assert.equal(malformed.status, 0);
  assert.equal(malformedOutput.continue, true);
  assert.equal(malformedOutput.metadata.failOpen, true);

  const stopOutput = hook(
    "stop",
    {
      cwd: projectA,
      transcript: [
        "We decided to keep hooks deterministic and local-first.",
        "The root cause is project memory leaking across unrelated workspaces.",
        "TODO add a focused hook regression test for Codex payload parsing.",
      ].join("\n"),
    },
    env
  );
  assert.equal(stopOutput.continue, true);
  assert.equal(stopOutput.metadata.written >= 1, true);

  const promptOutput = hook(
    "user-prompt-submit",
    { cwd: projectA, prompt: "fix Codex hook payload parsing regression" },
    env
  );
  assert.match(promptOutput.additionalContext, /OAZEN PROJECT CONTEXT/);
  assert.match(promptOutput.additionalContext, /hook regression test/);
  assert.doesNotMatch(promptOutput.additionalContext, /unrelated workspace/);
  assert.equal(promptOutput.metadata.projectName, "project-a");
  assert.equal("projectBranch" in promptOutput.metadata, true);
  assert.equal(promptOutput.metadata.recordsLoaded >= 1, true);
  assert.equal(promptOutput.metadata.projectRecordsLoaded >= 1, true);
  assert.equal(promptOutput.metadata.recordsRetrieved >= 1, true);
  assert.equal(promptOutput.metadata.injectedContextChars, promptOutput.additionalContext.length);
  assert.match(promptOutput.metadata.memoryFilePath, /project-memories\.json$/);
  assert.equal(promptOutput.metadata.skipReason, undefined);

  const projectBOutput = hook(
    "user-prompt-submit",
    { cwd: projectB, prompt: "fix Codex hook payload parsing regression" },
    env
  );
  assert.equal(projectBOutput.additionalContext, undefined);
  assert.equal(projectBOutput.metadata.projectName, "project-b");
  assert.equal("projectBranch" in projectBOutput.metadata, true);
  assert.equal(projectBOutput.metadata.recordsLoaded >= 1, true);
  assert.equal(projectBOutput.metadata.projectRecordsLoaded, 0);
  assert.equal(projectBOutput.metadata.recordsRetrieved, 0);
  assert.equal(projectBOutput.metadata.injectedContextChars, 0);
  assert.equal(projectBOutput.metadata.skipReason, "no_project_records");

  rmSync(tempRoot, { recursive: true, force: true });
});

test("doctor reports project memory diagnostics", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-doctor-"));
  const env = { OAZEN_HOME: path.join(tempRoot, "home") };
  const project = makeProject(tempRoot, "project");

  hook(
    "stop",
    {
      cwd: project,
      transcript: "We decided to expose doctor diagnostics for project memory retrieval.",
    },
    env
  );

  const doctor = JSON.parse(runCli(["doctor", "--cwd", project], { env }).stdout);
  assert.equal(doctor.kind, "doctor_result");
  assert.equal(typeof doctor.project.projectId, "string");
  assert.match(doctor.memoryFilePath, /project-memories\.json$/);
  assert.equal(doctor.recordsLoaded >= 1, true);
  assert.equal(doctor.projectRecordsLoaded >= 1, true);
  assert.equal(typeof doctor.projectBranchCounts, "object");

  rmSync(tempRoot, { recursive: true, force: true });
});

test("install codex creates hooks config with backup and uninstall removes managed events", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-install-"));
  const project = makeProject(tempRoot, "project");
  const codexDir = path.join(project, ".codex");
  const hooksPath = path.join(codexDir, "hooks.json");

  mkdirSync(codexDir, { recursive: true });
  writeFileSync(hooksPath, JSON.stringify({ hooks: { CustomEvent: [{ hooks: [] }] } }));

  const install = JSON.parse(runCli(["install", "codex", "--scope", "project"], { cwd: project }).stdout);
  assert.equal(install.kind, "install_result");
  assert.equal(install.backedUp, true);
  assert.equal(existsSync(`${hooksPath}.bak`), true);

  const hooksConfig = JSON.parse(readFileSync(hooksPath, "utf-8"));
  assert.ok(hooksConfig.hooks.SessionStart);
  assert.ok(hooksConfig.hooks.UserPromptSubmit);
  assert.ok(hooksConfig.hooks.Stop);
  assert.ok(hooksConfig.hooks.CustomEvent);
  const stopCommand = hooksConfig.hooks.Stop[0].hooks[0].command;
  assert.match(stopCommand, new RegExp(`OAZEN_HOME='${path.join(realpathSync(project), ".oazen")}'`));
  assert.match(stopCommand, /node'? '?/);
  assert.match(stopCommand, /hook codex stop$/);

  const uninstall = JSON.parse(runCli(["uninstall", "codex", "--scope", "project"], { cwd: project }).stdout);
  assert.deepEqual(uninstall.removedEvents, ["SessionStart", "UserPromptSubmit", "Stop"]);
  const uninstalledConfig = JSON.parse(readFileSync(hooksPath, "utf-8"));
  assert.equal(uninstalledConfig.hooks.SessionStart, undefined);
  assert.ok(uninstalledConfig.hooks.CustomEvent);

  rmSync(tempRoot, { recursive: true, force: true });
});

test("memory commands isolate two projects and deduplicate similar records", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-memory-"));
  const env = { OAZEN_HOME: path.join(tempRoot, "home") };
  const projectA = makeProject(tempRoot, "project-a");
  const projectB = makeProject(tempRoot, "project-b");

  const addedA = JSON.parse(
    runCli(
      [
        "memory",
        "add",
        "Always run focused hook tests before finishing Codex adapter changes.",
        "--cwd",
        projectA,
        "--type",
        "project_rule",
        "--pinned",
      ],
      { env }
    ).stdout
  );
  const duplicateA = JSON.parse(
    runCli(
      [
        "memory",
        "add",
        "Always run focused hook tests before finishing Codex adapter changes.",
        "--cwd",
        projectA,
        "--type",
        "project_rule",
      ],
      { env }
    ).stdout
  );
  runCli(
    ["memory", "add", "Project B uses a separate memory boundary.", "--cwd", projectB, "--type", "decision"],
    { env }
  );

  assert.equal(addedA.created, true);
  assert.equal(addedA.record.pinned, true);
  assert.equal(duplicateA.created, false);

  const listA = JSON.parse(runCli(["memory", "list", "--cwd", projectA], { env }).stdout);
  const listB = JSON.parse(runCli(["memory", "list", "--cwd", projectB], { env }).stdout);
  assert.equal(listA.count, 1);
  assert.equal(listB.count, 1);
  assert.notEqual(listA.records[0].projectId, listB.records[0].projectId);

  rmSync(tempRoot, { recursive: true, force: true });
});

test("layered memory compact preserves durable layers and archives noisy records", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-layered-"));
  const env = { OAZEN_HOME: path.join(tempRoot, "home") };
  const projectA = makeProject(tempRoot, "project-a");
  const projectB = makeProject(tempRoot, "project-b");
  const resolver = new ProjectResolver();
  const projectAId = resolver.resolve(projectA).projectId;
  const projectBId = resolver.resolve(projectB).projectId;
  const now = Date.now();
  const memoryFile = path.join(env.OAZEN_HOME, "data", "project-memories.json");

  mkdirSync(path.dirname(memoryFile), { recursive: true });
  writeFileSync(
    memoryFile,
    JSON.stringify({
      version: "1",
      records: [
        makeRecord("a-rule-old", projectAId, "project_rule", "Always run layered compaction tests before release.", now - 5000, 0.7),
        makeRecord("a-rule-new", projectAId, "project_rule", "Always run layered compaction tests before release.", now - 1000, 0.8),
        makeRecord("a-decision", projectAId, "decision", "We decided project memories stay local-first.", now - 900, 0.8),
        makeRecord("a-task-old-1", projectAId, "task_summary", "Older task summary about compacting repeated stop records.", now - 4000, 0.6),
        makeRecord("a-task-old-2", projectAId, "task_summary", "Older task summary about preserving durable decisions.", now - 3000, 0.6),
        makeRecord("a-task-latest", projectAId, "task_summary", "Latest turn implemented layered memory compaction.", now - 100, 0.6),
        makeRecord("a-noise", projectAId, "file_note", "obsolete-marker should stay out of retrieved context.", now - 50, 0.3),
        makeRecord("b-task", projectBId, "task_summary", "Project B memory must not be compacted from Project A.", now - 100, 0.6),
      ],
    }),
    "utf-8"
  );

  const compact = JSON.parse(
    runCli(["memory", "compact", "--cwd", projectA, "--strategy", "layered"], { env }).stdout
  );
  const listA = JSON.parse(runCli(["memory", "list", "--cwd", projectA], { env }).stdout);
  const listB = JSON.parse(runCli(["memory", "list", "--cwd", projectB], { env }).stdout);
  const prompt = hook("user-prompt-submit", { cwd: projectA, prompt: "obsolete-marker" }, env);

  assert.equal(compact.strategy, "layered");
  assert.equal(compact.stats.afterActive < compact.stats.beforeActive, true);
  assert.ok(listA.records.some((record) => record.layer === "stable-rules" && record.type === "project_rule"));
  assert.ok(listA.records.some((record) => record.layer === "durable-decisions" && record.type === "decision"));
  assert.ok(listA.records.some((record) => record.layer === "latest-turn"));
  assert.ok(listA.records.some((record) => record.layer === "working-summary"));
  assert.ok(listA.records.some((record) => record.layer === "archive" && record.archiveReason === "low_value"));
  assert.equal(listB.records.length, 1);
  assert.equal(listB.records[0].layer, undefined);
  assert.doesNotMatch(prompt.additionalContext ?? "", /obsolete-marker/);

  rmSync(tempRoot, { recursive: true, force: true });
});

test("memory retrieval reinforces injected records and applies decay scoring", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-decay-"));
  const env = { OAZEN_HOME: path.join(tempRoot, "home") };
  const projectA = makeProject(tempRoot, "project-a");
  const projectB = makeProject(tempRoot, "project-b");
  const resolver = new ProjectResolver();
  const projectAId = resolver.resolve(projectA).projectId;
  const projectBId = resolver.resolve(projectB).projectId;
  const now = Date.now();
  const old = now - 1000 * 60 * 60 * 24 * 90;
  const memoryFile = path.join(env.OAZEN_HOME, "data", "project-memories.json");

  mkdirSync(path.dirname(memoryFile), { recursive: true });
  writeFileSync(
    memoryFile,
    JSON.stringify({
      version: "1",
      records: [
        makeRecord("stale", projectAId, "file_note", "parser retry policy prefers old unused notes", old, 0.7),
        makeRecord("fresh", projectAId, "file_note", "parser retry policy uses fresh active notes", now - 1000, 0.7, {
          accessCount: 3,
          lastInjectedAt: now - 1000,
        }),
        makeRecord("pinned", projectAId, "file_note", "parser retry policy pinned historical note", old, 0.7, {
          pinned: true,
        }),
        makeRecord("archived", projectAId, "file_note", "parser retry policy archived hidden note", now, 0.9, {
          layer: "archive",
          archivedAt: now,
        }),
        makeRecord("other", projectBId, "file_note", "parser retry policy other project note", now, 0.9),
      ],
    }),
    "utf-8"
  );

  const retriever = new MemoryRetriever(new MemoryStore(memoryFile));
  const retrieval = await retriever.retrieveWithDiagnostics(projectAId, "parser retry policy", 2000);
  const ids = retrieval.memories.map((record) => record.id);
  const fresh = retrieval.memories.find((record) => record.id === "fresh");
  const stale = retrieval.memories.find((record) => record.id === "stale");
  const pinned = retrieval.memories.find((record) => record.id === "pinned");

  assert.equal(ids.includes("archived"), false);
  assert.equal(ids.includes("other"), false);
  assert.ok(fresh && stale && pinned);
  assert.equal(fresh.score > stale.score, true);
  assert.equal((pinned.decayScore ?? 0) >= 0.72, true);
  assert.equal((stale.decayScore ?? 1) < (fresh.decayScore ?? 0), true);
  assert.equal(typeof retrieval.diagnostics.decayScoreMin, "number");
  assert.equal(typeof retrieval.diagnostics.decayScoreMax, "number");

  const prompt = hook("user-prompt-submit", { cwd: projectA, prompt: "parser retry policy fresh active" }, env);
  const recordsAfterPrompt = JSON.parse(readFileSync(memoryFile, "utf-8")).records;
  const reinforced = recordsAfterPrompt.find((record) => record.id === "fresh");
  const archived = recordsAfterPrompt.find((record) => record.id === "archived");

  assert.equal(prompt.metadata.decayScoreMax <= 1, true);
  assert.equal(reinforced.accessCount >= 4, true);
  assert.equal(typeof reinforced.lastInjectedAt, "number");
  assert.equal(reinforced.decayScore, 1);
  assert.equal(archived.accessCount ?? 0, 0);

  rmSync(tempRoot, { recursive: true, force: true });
});

test("import codex dry-run filters current project and import deduplicates records", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-import-"));
  const env = { OAZEN_HOME: path.join(tempRoot, "home") };
  const projectA = makeProject(tempRoot, "project-a");
  const projectB = makeProject(tempRoot, "project-b");
  const sourceDir = path.join(tempRoot, "codex-home", "memories");
  const rolloutDir = path.join(sourceDir, "rollout_summaries");

  mkdirSync(rolloutDir, { recursive: true });
  writeFileSync(
    path.join(sourceDir, "MEMORY.md"),
    [
      "## /Users/example/other",
      "- Other project should never be imported into project-a memory.",
      `## ${projectA}`,
      "- Always run focused import tests before finishing Codex memory import changes.",
      "- We decided Codex import must stay local-first and deterministic.",
      `## ${projectB}`,
      "- Project B uses a separate memory boundary.",
    ].join("\n")
  );
  writeFileSync(
    path.join(rolloutDir, "project-a.md"),
    [
      `# Import notes for ${projectA}`,
      "- TODO add a dry-run check for Codex memory import.",
      "- Failure mode: imported memories must not include unrelated projects.",
    ].join("\n")
  );

  const dryRun = JSON.parse(
    runCli(["import", "codex", "--scope", "project", "--cwd", projectA, "--source-dir", sourceDir, "--dry-run"], {
      env,
    }).stdout
  );
  assert.equal(dryRun.kind, "codex_memory_import_result");
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.written, 0);
  assert.equal(dryRun.candidates >= 3, true);
  assert.equal(dryRun.records.every((record) => record.projectId === dryRun.project.projectId), true);
  assert.ok(dryRun.records.every((record) => record.source === "codex_import"));
  assert.ok(dryRun.records.every((record) => record.provenance.provider === "codex"));
  assert.doesNotMatch(JSON.stringify(dryRun.records), /Project B uses a separate memory boundary/);

  const emptyList = JSON.parse(runCli(["memory", "list", "--cwd", projectA], { env }).stdout);
  assert.equal(emptyList.count, 0);

  const imported = JSON.parse(
    runCli(["import", "codex", "--scope", "project", "--cwd", projectA, "--source-dir", sourceDir], { env }).stdout
  );
  const importedAgain = JSON.parse(
    runCli(["import", "codex", "--scope", "project", "--cwd", projectA, "--source-dir", sourceDir], { env }).stdout
  );
  const listA = JSON.parse(runCli(["memory", "list", "--cwd", projectA], { env }).stdout);
  const listB = JSON.parse(runCli(["memory", "list", "--cwd", projectB], { env }).stdout);

  assert.equal(imported.created > 0, true);
  assert.equal(imported.written, imported.candidates);
  assert.equal(importedAgain.created, 0);
  assert.equal(importedAgain.updated, importedAgain.candidates);
  assert.equal(listA.count, imported.created);
  assert.equal(listB.count, 0);
  assert.match(JSON.stringify(listA.records), /local-first and deterministic/);

  rmSync(tempRoot, { recursive: true, force: true });
});

test("ProjectResolver resolves git repo root, branch, and cwd fallback", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-project-"));
  const repo = path.join(tempRoot, "repo");
  const nested = path.join(repo, "packages", "app");
  const plain = path.join(tempRoot, "plain");

  mkdirSync(nested, { recursive: true });
  mkdirSync(plain, { recursive: true });
  spawnSync("git", ["init"], { cwd: repo, encoding: "utf-8" });
  spawnSync("git", ["checkout", "-b", "feature/hooks"], { cwd: repo, encoding: "utf-8" });

  const resolver = new ProjectResolver();
  const gitProject = resolver.resolve(nested);
  const plainProject = resolver.resolve(plain);

  assert.equal(realpathSync(gitProject.repoRoot), realpathSync(repo));
  assert.equal(gitProject.gitRemote, undefined);
  assert.equal(gitProject.currentBranch, "feature/hooks");
  assert.equal(plainProject.repoRoot, undefined);
  assert.notEqual(gitProject.projectId, plainProject.projectId);

  rmSync(tempRoot, { recursive: true, force: true });
});
