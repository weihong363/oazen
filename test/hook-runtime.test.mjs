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
  assert.equal(duplicateA.created, false);

  const listA = JSON.parse(runCli(["memory", "list", "--cwd", projectA], { env }).stdout);
  const listB = JSON.parse(runCli(["memory", "list", "--cwd", projectB], { env }).stdout);
  assert.equal(listA.count, 1);
  assert.equal(listB.count, 1);
  assert.notEqual(listA.records[0].projectId, listB.records[0].projectId);

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
