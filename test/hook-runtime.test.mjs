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

  const projectBOutput = hook(
    "user-prompt-submit",
    { cwd: projectB, prompt: "fix Codex hook payload parsing regression" },
    env
  );
  assert.equal(projectBOutput.additionalContext, undefined);

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
