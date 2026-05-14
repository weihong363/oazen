import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile, spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = path.resolve(process.cwd());
const cliPath = path.join(repoRoot, "dist", "index.js");

function runCli(args, options = {}) {
  const result = spawnSync("node", [cliPath, ...args], {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
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

function runCliAsync(args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      "node",
      [cliPath, ...args],
      {
        cwd: options.cwd ?? repoRoot,
        env: { ...process.env, ...options.env },
        encoding: "utf-8",
      },
      (error, stdout, stderr) => {
        if (error && !options.allowFailure) {
          reject(new Error(stderr || stdout || error.message));
          return;
        }

        resolve({
          status: error?.code ?? 0,
          stdout,
          stderr,
        });
      }
    );
  });
}

test("CLI smoke flow is repeatable across cwd and respects scope plus safety gates", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-smoke-"));
  const memoryHome = path.join(tempRoot, "memory-home");
  const fakeRepo = path.join(tempRoot, "workspace");
  const fakeProject = path.join(fakeRepo, "packages", "app");
  const sessionFile = path.join(tempRoot, "session.txt");

  mkdirSync(path.join(fakeRepo, ".git"), { recursive: true });
  mkdirSync(fakeProject, { recursive: true });
  writeFileSync(path.join(fakeRepo, "package.json"), '{"name":"root"}');
  writeFileSync(path.join(fakeProject, "package.json"), '{"name":"app"}');
  writeFileSync(
    sessionFile,
    [
      "We decided to use project scoped memory for app-specific runtime decisions.",
      "The root cause is parser state drift across repeated retries in the app worker.",
      "The root cause is /Users/alice/private/app path leakage in logs.",
      "api_key=supersecretvalue123456789",
    ].join("\n")
  );

  const env = { OAZEN_HOME: memoryHome };
  const firstWriteback = JSON.parse(
    runCli(["writeback", "--file", sessionFile, "--cwd", fakeProject], { env }).stdout
  );

  assert.equal(firstWriteback.kind, "memory_mutation_result");
  assert.equal(firstWriteback.action, "writeback");
  assert.equal(firstWriteback.scope.inferredWriteScope, "project");
  assert.equal(firstWriteback.counts.created, 3);
  assert.equal(firstWriteback.counts.blocked, 1);
  assert.ok(
    firstWriteback.changes.some((change) => change.after?.restrictedToInbox === true),
    "expected one review-only inbox memory"
  );

  const memoryFile = path.join(memoryHome, "data", "memories.json");
  assert.equal(JSON.parse(readFileSync(memoryFile, "utf-8")).length, 3);

  const secondWriteback = JSON.parse(
    runCli(["writeback", "--file", sessionFile, "--cwd", fakeProject], {
      cwd: fakeRepo,
      env,
    }).stdout
  );
  assert.equal(secondWriteback.kind, "memory_mutation_result");
  assert.equal(secondWriteback.action, "writeback");
  assert.equal(secondWriteback.counts.created, 0);
  assert.equal(secondWriteback.counts.changed, 3);
  assert.ok(secondWriteback.changes.every((change) => change.before !== null));
  assert.equal(JSON.parse(readFileSync(memoryFile, "utf-8")).length, 3);

  const review = JSON.parse(runCli(["review"], { env }).stdout);
  assert.equal(review.kind, "memory_query_result");
  assert.equal(review.action, "review");
  assert.equal(review.counts.total, 3);
  assert.equal(review.counts.conflicts, 0);

  const approvableId = review.items.find(
    (memory) => !memory.restrictedToInbox && memory.kind === "fact"
  )?.id;
  const inboxOnlyId = review.items.find((memory) => memory.restrictedToInbox)?.id;

  assert.ok(approvableId, "expected an approvable inbox item");
  assert.ok(inboxOnlyId, "expected a restricted inbox item");

  const approveResult = JSON.parse(runCli(["approve", approvableId], { env }).stdout);
  assert.equal(approveResult.kind, "memory_mutation_result");
  assert.equal(approveResult.action, "approve");
  assert.equal(approveResult.counts.changed, 1);
  assert.equal(approveResult.changes[0].before.layer, "inbox");
  assert.equal(approveResult.changes[0].after.layer, "session");

  const rejectedApproval = runCli(["approve", inboxOnlyId], { env, allowFailure: true });
  assert.notEqual(rejectedApproval.status, 0);
  const rejectedApprovalError = JSON.parse(rejectedApproval.stderr);
  assert.equal(rejectedApprovalError.kind, "memory_action_error");
  assert.equal(rejectedApprovalError.action, "approve");
  assert.match(rejectedApprovalError.error.message, /Sensitive inbox-only memory cannot be approved/);

  const promoteResult = JSON.parse(runCli(["promote", approvableId], { env }).stdout);
  assert.equal(promoteResult.kind, "memory_mutation_result");
  assert.equal(promoteResult.action, "promote");
  assert.equal(promoteResult.changes[0].before.layer, "session");
  assert.equal(promoteResult.changes[0].after.layer, "fact");

  const recall = JSON.parse(
    runCli(["recall", "parser retries in app worker", "--cwd", fakeProject], { env }).stdout
  );
  assert.equal(recall.version, "1");
  assert.equal(recall.kind, "recall_result");
  assert.equal(recall.action, "recall");
  assert.ok(recall.memories.length >= 1, "expected at least one recalled memory");
  assert.ok(recall.counts.retrieved >= recall.counts.selected);
  assert.ok(recall.tokenEstimate.baseline >= recall.tokenEstimate.selected);
  assert.ok(
    recall.memories.every((memory) => memory.scope === "project" || memory.scope === "global")
  );
  assert.ok(
    recall.facts.some((entry) => entry.includes("parser state drift")),
    "expected promoted fact to be recalled"
  );

  const codexPacket = runCli(
    ["recall", "parser retries in app worker", "--cwd", fakeProject, "--format", "codex"],
    { env }
  );
  assert.match(codexPacket.stdout, /<OAZEN_CONTEXT_PACKET version="1">/);

  rmSync(tempRoot, { recursive: true, force: true });
});

test("codex preload and run provide a stable end-to-end sidecar loop", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-codex-"));
  const memoryHome = path.join(tempRoot, "memory-home");
  const fakeRepo = path.join(tempRoot, "workspace");
  const fakeProject = path.join(fakeRepo, "packages", "app");
  const packetFile = path.join(tempRoot, "artifacts", "context.txt");
  const sessionFile = path.join(tempRoot, "artifacts", "codex-session.log");
  const agentScript = path.join(tempRoot, "fake-agent.mjs");
  const env = { OAZEN_HOME: memoryHome };

  mkdirSync(path.join(fakeRepo, ".git"), { recursive: true });
  mkdirSync(fakeProject, { recursive: true });
  writeFileSync(path.join(fakeRepo, "package.json"), '{"name":"repo"}');
  writeFileSync(path.join(fakeProject, "package.json"), '{"name":"app"}');
  writeFileSync(
    agentScript,
    [
      "import fs from 'node:fs';",
      "const [packetArg, taskArg, packetPathArg, cwdArg] = process.argv.slice(2);",
      "const packetFromFile = fs.readFileSync(packetPathArg, 'utf-8');",
      "console.log(`agent cwd: ${process.cwd()}`);",
      "console.log(`template cwd: ${cwdArg}`);",
      "console.log(`task arg: ${taskArg}`);",
      "console.log(packetArg.includes('<OAZEN_CONTEXT_PACKET version=\"1\">') ? 'packet arg ok' : 'packet arg missing');",
      "console.log(packetFromFile.includes('selected_memories:') ? 'packet file ok' : 'packet file missing');",
      "console.log('We decided to keep the Codex sidecar loop minimal and deterministic.');",
      "console.log('The root cause is missing preload context before task execution.');",
      "console.error('stderr marker for capture');",
    ].join("\n")
  );

  const seedSession = path.join(tempRoot, "seed-session.txt");
  writeFileSync(
    seedSession,
    "The root cause is parser retry drift inside the app package worker."
  );

  const seedWriteback = JSON.parse(
    runCli(["writeback", "--file", seedSession, "--cwd", fakeProject], { env }).stdout
  );
  const seedReview = JSON.parse(runCli(["review"], { env }).stdout);
  const seedId = seedReview.items.find((item) =>
    item.content.includes("parser retry drift inside the app package worker")
  )?.id;

  assert.equal(seedWriteback.counts.created, 1);
  assert.ok(seedId, "expected a seeded inbox memory");
  runCli(["approve", seedId], { env });
  runCli(["promote", seedId], { env });

  const preload = JSON.parse(
    runCli(
      [
        "codex",
        "preload",
        "fix parser retries",
        "--cwd",
        fakeProject,
        "--packet-file",
        packetFile,
        "--format",
        "json",
      ],
      { cwd: fakeRepo, env }
    ).stdout
  );

  assert.equal(preload.kind, "codex_sidecar_result");
  assert.equal(preload.action, "preload");
  assert.equal(preload.cwd, fakeProject);
  assert.equal(preload.packetFile, packetFile);
  assert.ok(Array.isArray(preload.selectedMemoryIds));
  assert.ok(preload.selectedMemoryIds.length >= 1);
  assert.match(preload.packet, /<OAZEN_CONTEXT_PACKET version="1">/);
  assert.ok(
    preload.recall.facts.some((entry) => entry.includes("parser retry drift")),
    "expected project-scoped memory in preload recall"
  );
  assert.equal(readFileSync(packetFile, "utf-8"), preload.packet);

  const run = JSON.parse(
    runCli(
      [
        "codex",
        "run",
        "fix parser retries",
        "--cwd",
        fakeProject,
        "--packet-file",
        packetFile,
        "--session-file",
        sessionFile,
        "--",
        process.execPath,
        agentScript,
        "{packet}",
        "{task}",
        "{packetFile}",
        "{cwd}",
      ],
      { cwd: fakeRepo, env }
    ).stdout
  );

  assert.equal(run.kind, "codex_sidecar_result");
  assert.equal(run.action, "run");
  assert.equal(run.cwd, fakeProject);
  assert.equal(run.sessionFile, sessionFile);
  assert.equal(run.rawSessionFile, sessionFile);
  assert.ok(run.writebackInputFile.endsWith(".writeback.txt"));
  assert.ok(existsSync(run.writebackInputFile), "expected writeback input file");
  assert.ok(Array.isArray(run.selectedMemoryIds));
  assert.ok(run.selectedMemoryIds.length >= 1);
  assert.equal(run.execution.exitCode, 0);
  assert.deepEqual(run.execution.requestedCommand, [
    process.execPath,
    agentScript,
    "{packet}",
    "{task}",
    "{packetFile}",
    "{cwd}",
  ]);
  assert.equal(run.execution.rawSessionFile, sessionFile);
  assert.ok(run.writeback, "expected writeback to run after command execution");
  assert.equal(run.writeback.scope.inferredWriteScope, "project");
  assert.ok(run.writeback.counts.created >= 2);
  assert.equal(run.packetFile, packetFile);
  assert.ok(existsSync(sessionFile), "expected captured session log");

  const sessionLog = readFileSync(sessionFile, "utf-8");
  assert.match(sessionLog, /agent cwd: .*packages\/app/);
  assert.match(sessionLog, /packet arg ok/);
  assert.match(sessionLog, /packet file ok/);
  assert.match(sessionLog, /stderr marker for capture/);
  const writebackInput = readFileSync(run.writebackInputFile, "utf-8");
  assert.match(writebackInput, /Task: fix parser retries/);
  assert.match(writebackInput, /Exit code: 0/);
  assert.match(writebackInput, /--- Captured output ---/);

  const review = JSON.parse(runCli(["review"], { env }).stdout);
  assert.ok(
    review.items.some((item) =>
      item.content.includes("Codex sidecar loop minimal and deterministic")
    ),
    "expected run output to be written back as inbox memory"
  );
  assert.ok(
    review.items.some((item) =>
      item.content.includes("missing preload context before task execution")
    ),
    "expected root-cause learning from captured session log"
  );

  rmSync(tempRoot, { recursive: true, force: true });
});

test("codex run falls back to pipe capture when the parent process has no tty", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-codex-pty-"));
  const memoryHome = path.join(tempRoot, "memory-home");
  const fakeRepo = path.join(tempRoot, "workspace");
  const fakeProject = path.join(fakeRepo, "packages", "app");
  const sessionFile = path.join(tempRoot, "artifacts", "codex-session.log");
  const agentScript = path.join(tempRoot, "fake-agent-pty.mjs");
  const env = { OAZEN_HOME: memoryHome };

  mkdirSync(path.join(fakeRepo, ".git"), { recursive: true });
  mkdirSync(fakeProject, { recursive: true });
  writeFileSync(path.join(fakeRepo, "package.json"), '{"name":"repo"}');
  writeFileSync(path.join(fakeProject, "package.json"), '{"name":"app"}');
  writeFileSync(
    agentScript,
    [
      "console.log(`stdout is tty: ${Boolean(process.stdout.isTTY)}`);",
      "console.log(`stdin is tty: ${Boolean(process.stdin.isTTY)}`);",
      "console.log('fallback output marker');",
    ].join("\n")
  );

  const run = runCli(
    [
      "codex",
      "run",
      "fix parser retries",
      "--cwd",
      fakeProject,
      "--session-file",
      sessionFile,
      "--",
      process.execPath,
      agentScript,
    ],
    { cwd: fakeRepo, env }
  );

  const result = JSON.parse(run.stdout);
  assert.equal(result.kind, "codex_sidecar_result");
  assert.equal(result.action, "run");
  assert.equal(result.execution.exitCode, 0);
  assert.equal(result.execution.terminalMode, "pipe");
  assert.equal(run.stderr, "");
  assert.ok(existsSync(sessionFile), "expected fallback run to still write a session log");

  const sessionLog = readFileSync(sessionFile, "utf-8");
  assert.match(sessionLog, /stdout is tty: false/i);
  assert.match(sessionLog, /fallback output marker/);

  rmSync(tempRoot, { recursive: true, force: true });
});

test("codex interactive starts with a default project-continuation task", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-codex-interactive-"));
  const memoryHome = path.join(tempRoot, "memory-home");
  const fakeRepo = path.join(tempRoot, "workspace");
  const fakeProject = path.join(fakeRepo, "packages", "app");
  const sessionFile = path.join(tempRoot, "artifacts", "codex-session.log");
  const agentScript = path.join(tempRoot, "fake-agent-interactive.mjs");
  const env = { OAZEN_HOME: memoryHome };

  mkdirSync(path.join(fakeRepo, ".git"), { recursive: true });
  mkdirSync(fakeProject, { recursive: true });
  writeFileSync(path.join(fakeRepo, "package.json"), '{"name":"repo"}');
  writeFileSync(path.join(fakeProject, "package.json"), '{"name":"app"}');
  writeFileSync(
    agentScript,
    [
      "console.log(`interactive task: ${process.env.OAZEN_TASK}`);",
      "console.log('We decided to support project-continuation interactive Codex sessions.');",
    ].join("\n")
  );

  const run = JSON.parse(
    runCli(
      [
        "codex",
        "interactive",
        "--cwd",
        fakeProject,
        "--session-file",
        sessionFile,
        "--",
        process.execPath,
        agentScript,
      ],
      { cwd: fakeRepo, env }
    ).stdout
  );

  assert.equal(run.kind, "codex_sidecar_result");
  assert.equal(run.action, "run");
  assert.equal(run.task, "continue work in this project");
  assert.equal(run.execution.exitCode, 0);
  assert.deepEqual(run.execution.requestedCommand, [process.execPath, agentScript]);
  const sessionLog = readFileSync(sessionFile, "utf-8");
  assert.match(sessionLog, /interactive task: continue work in this project/);

  const review = JSON.parse(runCli(["review"], { env }).stdout);
  assert.ok(
    review.items.some((item) =>
      item.content.includes("project-continuation interactive Codex sessions")
    ),
    "expected interactive output to be written back"
  );

  rmSync(tempRoot, { recursive: true, force: true });
});

test("codex interactive defaults to the real interactive codex entrypoint", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-codex-interactive-default-"));
  const memoryHome = path.join(tempRoot, "memory-home");
  const fakeBin = path.join(tempRoot, "bin");
  const fakeCodex = path.join(fakeBin, "codex");
  const fakeRepo = path.join(tempRoot, "workspace");
  const fakeProject = path.join(fakeRepo, "packages", "app");
  const sessionFile = path.join(tempRoot, "artifacts", "codex-session.log");
  const env = { OAZEN_HOME: memoryHome, PATH: `${fakeBin}:${process.env.PATH}` };

  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(path.join(fakeRepo, ".git"), { recursive: true });
  mkdirSync(fakeProject, { recursive: true });
  writeFileSync(path.join(fakeRepo, "package.json"), '{"name":"repo"}');
  writeFileSync(path.join(fakeProject, "package.json"), '{"name":"app"}');
  writeFileSync(
    fakeCodex,
    [
      "#!/bin/sh",
      "printf 'codex argv count: %s\\n' \"$#\"",
      "printf 'codex first arg: %s\\n' \"$1\"",
      "case \"$1\" in",
      "  exec) printf 'unexpected exec mode\\n'; exit 9 ;;",
      "esac",
      "printf '%s\\n' \"$1\" | grep -q '<OAZEN_CONTEXT_PACKET version=\"1\">'",
      "printf 'interactive default entrypoint ok\\n'",
    ].join("\n")
  );
  chmodSync(fakeCodex, 0o755);

  const run = JSON.parse(
    runCli(
      [
        "codex",
        "interactive",
        "--cwd",
        fakeProject,
        "--session-file",
        sessionFile,
        "--skip-writeback",
      ],
      { cwd: fakeRepo, env }
    ).stdout
  );

  assert.equal(run.kind, "codex_sidecar_result");
  assert.equal(run.action, "run");
  assert.equal(run.execution.exitCode, 0);
  assert.deepEqual(run.execution.requestedCommand, [
    "codex",
    "{packet}\n\nContinue working in this project. Ask me what to do next.",
  ]);

  const sessionLog = readFileSync(sessionFile, "utf-8");
  assert.match(sessionLog, /codex argv count: 1/);
  assert.match(sessionLog, /interactive default entrypoint ok/);
  assert.doesNotMatch(sessionLog, /unexpected exec mode/);

  rmSync(tempRoot, { recursive: true, force: true });
});

test("codex run failures are structured and do not mutate memory", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-codex-fail-"));
  const memoryHome = path.join(tempRoot, "memory-home");
  const fakeRepo = path.join(tempRoot, "workspace");
  const fakeProject = path.join(fakeRepo, "packages", "app");
  const env = { OAZEN_HOME: memoryHome };

  mkdirSync(path.join(fakeRepo, ".git"), { recursive: true });
  mkdirSync(fakeProject, { recursive: true });
  writeFileSync(path.join(fakeRepo, "package.json"), '{"name":"repo"}');
  writeFileSync(path.join(fakeProject, "package.json"), '{"name":"app"}');

  const failure = runCli(
    [
      "codex",
      "run",
      "fix parser retries",
      "--cwd",
      fakeProject,
      "--",
      "definitely-not-a-real-command",
    ],
    { cwd: fakeRepo, env, allowFailure: true }
  );

  assert.notEqual(failure.status, 0);
  const error = JSON.parse(failure.stderr);
  assert.equal(error.kind, "memory_action_error");
  assert.equal(error.action, "codex-run");
  assert.match(error.error.message, /ENOENT|spawn|not-a-real-command/);
  assert.equal(error.error.exitCode, undefined);
  const memoryFile = path.join(memoryHome, "data", "memories.json");
  const storedMemories = existsSync(memoryFile) ? JSON.parse(readFileSync(memoryFile, "utf-8")) : [];
  assert.equal(storedMemories.length, 0);

  rmSync(tempRoot, { recursive: true, force: true });
});

test("codex preload emits packet text and creates a default packet file when none is provided", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-codex-preload-"));
  const memoryHome = path.join(tempRoot, "memory-home");
  const fakeRepo = path.join(tempRoot, "workspace");
  const fakeProject = path.join(fakeRepo, "packages", "app");
  const env = { OAZEN_HOME: memoryHome };

  mkdirSync(path.join(fakeRepo, ".git"), { recursive: true });
  mkdirSync(fakeProject, { recursive: true });
  writeFileSync(path.join(fakeRepo, "package.json"), '{"name":"repo"}');
  writeFileSync(path.join(fakeProject, "package.json"), '{"name":"app"}');

  const seedSession = path.join(tempRoot, "seed-session.txt");
  writeFileSync(
    seedSession,
    "The root cause is parser retry drift inside the app package worker."
  );

  const seedId = JSON.parse(
    runCli(["writeback", "--file", seedSession, "--cwd", fakeProject], { env }).stdout
  );
  assert.equal(seedId.counts.created, 1);

  const review = JSON.parse(runCli(["review"], { env }).stdout);
  const memoryId = review.items.find((item) =>
    item.content.includes("parser retry drift inside the app package worker")
  )?.id;

  assert.ok(memoryId, "expected seeded inbox memory");
  runCli(["approve", memoryId], { env });
  runCli(["promote", memoryId], { env });

  const packetOnly = runCli(
    ["codex", "preload", "fix parser retries", "--cwd", fakeProject],
    { cwd: fakeRepo, env }
  );
  assert.match(packetOnly.stdout, /^<OAZEN_CONTEXT_PACKET version="1">/);
  assert.match(packetOnly.stdout, /selected_memories:/);
  assert.match(packetOnly.stdout, /parser retry drift inside the app package worker/);

  const preloadJson = JSON.parse(
    runCli(
      ["codex", "preload", "fix parser retries", "--cwd", fakeProject, "--format", "json"],
      { cwd: fakeRepo, env }
    ).stdout
  );

  assert.equal(preloadJson.kind, "codex_sidecar_result");
  assert.equal(preloadJson.action, "preload");
  assert.ok(preloadJson.packetFile, "expected generated packet file path");
  assert.ok(existsSync(preloadJson.packetFile), "expected generated packet file to exist");
  assert.equal(readFileSync(preloadJson.packetFile, "utf-8"), preloadJson.packet);

  rmSync(tempRoot, { recursive: true, force: true });
});

test("codex run injects OAZEN environment variables for agent commands", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-codex-env-"));
  const memoryHome = path.join(tempRoot, "memory-home");
  const fakeRepo = path.join(tempRoot, "workspace");
  const fakeProject = path.join(fakeRepo, "packages", "app");
  const sessionFile = path.join(tempRoot, "artifacts", "codex-session.log");
  const agentScript = path.join(tempRoot, "fake-agent-env.mjs");
  const env = { OAZEN_HOME: memoryHome };

  mkdirSync(path.join(fakeRepo, ".git"), { recursive: true });
  mkdirSync(fakeProject, { recursive: true });
  writeFileSync(path.join(fakeRepo, "package.json"), '{"name":"repo"}');
  writeFileSync(path.join(fakeProject, "package.json"), '{"name":"app"}');
  writeFileSync(
    agentScript,
    [
      "import fs from 'node:fs';",
      "const packet = process.env.OAZEN_CONTEXT_PACKET ?? '';",
      "const packetFile = process.env.OAZEN_CONTEXT_FILE ?? '';",
      "const task = process.env.OAZEN_TASK ?? '';",
      "const sessionFile = process.env.OAZEN_SESSION_FILE ?? '';",
      "const packetFromFile = fs.readFileSync(packetFile, 'utf-8');",
      "console.log(`env task: ${task}`);",
      "console.log(`env session file: ${sessionFile}`);",
      "console.log(packet.includes('<OAZEN_CONTEXT_PACKET version=\"1\">') ? 'env packet ok' : 'env packet missing');",
      "console.log(packetFromFile === packet ? 'env packet file ok' : 'env packet file mismatch');",
      "console.log('We decided to trust OAZEN environment wiring for Codex CLI tasks.');",
    ].join("\n")
  );

  const run = JSON.parse(
    runCli(
      [
        "codex",
        "run",
        "fix parser retries",
        "--cwd",
        fakeProject,
        "--session-file",
        sessionFile,
        "--",
        process.execPath,
        agentScript,
      ],
      { cwd: fakeRepo, env }
    ).stdout
  );

  assert.equal(run.kind, "codex_sidecar_result");
  assert.equal(run.action, "run");
  assert.equal(run.sessionFile, sessionFile);
  assert.ok(existsSync(run.writebackInputFile), "expected separated writeback input file");
  const sessionLog = readFileSync(sessionFile, "utf-8");
  assert.match(sessionLog, /env task: fix parser retries/);
  assert.match(sessionLog, new RegExp(`env session file: ${sessionFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(sessionLog, /env packet ok/);
  assert.match(sessionLog, /env packet file ok/);

  const review = JSON.parse(runCli(["review"], { env }).stdout);
  assert.ok(
    review.items.some((item) =>
      item.content.includes("trust OAZEN environment wiring for Codex CLI tasks")
    ),
    "expected env-driven output to be written back"
  );

  rmSync(tempRoot, { recursive: true, force: true });
});

test("codex run supports skip-writeback while still capturing the session log", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-codex-skip-"));
  const memoryHome = path.join(tempRoot, "memory-home");
  const fakeRepo = path.join(tempRoot, "workspace");
  const fakeProject = path.join(fakeRepo, "packages", "app");
  const sessionFile = path.join(tempRoot, "artifacts", "codex-session.log");
  const agentScript = path.join(tempRoot, "fake-agent-skip.mjs");
  const env = { OAZEN_HOME: memoryHome };

  mkdirSync(path.join(fakeRepo, ".git"), { recursive: true });
  mkdirSync(fakeProject, { recursive: true });
  writeFileSync(path.join(fakeRepo, "package.json"), '{"name":"repo"}');
  writeFileSync(path.join(fakeProject, "package.json"), '{"name":"app"}');
  writeFileSync(
    agentScript,
    [
      "console.log('We decided to skip writeback for this Codex CLI smoke run.');",
      "console.log('The root cause is intentionally deferred writeback execution.');",
    ].join("\n")
  );

  const run = JSON.parse(
    runCli(
      [
        "codex",
        "run",
        "fix parser retries",
        "--cwd",
        fakeProject,
        "--session-file",
        sessionFile,
        "--skip-writeback",
        "--",
        process.execPath,
        agentScript,
      ],
      { cwd: fakeRepo, env }
    ).stdout
  );

  assert.equal(run.kind, "codex_sidecar_result");
  assert.equal(run.action, "run");
  assert.equal(run.execution.exitCode, 0);
  assert.equal(run.writeback, undefined);
  assert.ok(existsSync(sessionFile), "expected session log even when writeback is skipped");
  assert.ok(existsSync(run.writebackInputFile), "expected derived writeback input even when skipped");
  const sessionLog = readFileSync(sessionFile, "utf-8");
  assert.match(sessionLog, /skip writeback for this Codex CLI smoke run/);
  const writebackInput = readFileSync(run.writebackInputFile, "utf-8");
  assert.match(writebackInput, /Exit code: 0/);

  const memoryFile = path.join(memoryHome, "data", "memories.json");
  const storedMemories = existsSync(memoryFile) ? JSON.parse(readFileSync(memoryFile, "utf-8")) : [];
  assert.equal(storedMemories.length, 0);

  rmSync(tempRoot, { recursive: true, force: true });
});

test("codex run writes an empty session log without creating memories when the command emits nothing", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-codex-empty-"));
  const memoryHome = path.join(tempRoot, "memory-home");
  const fakeRepo = path.join(tempRoot, "workspace");
  const fakeProject = path.join(fakeRepo, "packages", "app");
  const sessionFile = path.join(tempRoot, "artifacts", "codex-session.log");
  const agentScript = path.join(tempRoot, "fake-agent-empty.mjs");
  const env = { OAZEN_HOME: memoryHome };

  mkdirSync(path.join(fakeRepo, ".git"), { recursive: true });
  mkdirSync(fakeProject, { recursive: true });
  writeFileSync(path.join(fakeRepo, "package.json"), '{"name":"repo"}');
  writeFileSync(path.join(fakeProject, "package.json"), '{"name":"app"}');
  writeFileSync(agentScript, "process.exit(0);\n");

  const run = JSON.parse(
    runCli(
      [
        "codex",
        "run",
        "fix parser retries",
        "--cwd",
        fakeProject,
        "--session-file",
        sessionFile,
        "--",
        process.execPath,
        agentScript,
      ],
      { cwd: fakeRepo, env }
    ).stdout
  );

  assert.equal(run.kind, "codex_sidecar_result");
  assert.equal(run.action, "run");
  assert.equal(run.execution.exitCode, 0);
  assert.equal(run.writeback.counts.created, 0);
  assert.equal(readFileSync(sessionFile, "utf-8"), "");
  const writebackInput = readFileSync(run.writebackInputFile, "utf-8");
  assert.match(writebackInput, /Exit code: 0/);

  const memoryFile = path.join(memoryHome, "data", "memories.json");
  const storedMemories = existsSync(memoryFile) ? JSON.parse(readFileSync(memoryFile, "utf-8")) : [];
  assert.equal(storedMemories.length, 0);

  rmSync(tempRoot, { recursive: true, force: true });
});

test("codex run preserves a non-zero command exit code and still writes back from the derived input file", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-codex-exit-"));
  const memoryHome = path.join(tempRoot, "memory-home");
  const fakeRepo = path.join(tempRoot, "workspace");
  const fakeProject = path.join(fakeRepo, "packages", "app");
  const sessionFile = path.join(tempRoot, "artifacts", "codex-session.log");
  const agentScript = path.join(tempRoot, "fake-agent-exit.mjs");
  const env = { OAZEN_HOME: memoryHome };

  mkdirSync(path.join(fakeRepo, ".git"), { recursive: true });
  mkdirSync(fakeProject, { recursive: true });
  writeFileSync(path.join(fakeRepo, "package.json"), '{"name":"repo"}');
  writeFileSync(path.join(fakeProject, "package.json"), '{"name":"app"}');
  writeFileSync(
    agentScript,
    [
      "console.log('We decided to preserve the original Codex CLI exit code.');",
      "console.log('The root cause is an intentional failing command for exit-code validation.');",
      "process.exit(7);",
    ].join("\n")
  );

  const failure = runCli(
    [
      "codex",
      "run",
      "fix parser retries",
      "--cwd",
      fakeProject,
      "--session-file",
      sessionFile,
      "--",
      process.execPath,
      agentScript,
    ],
    { cwd: fakeRepo, env, allowFailure: true }
  );

  assert.equal(failure.status, 7);
  const error = JSON.parse(failure.stderr);
  assert.equal(error.kind, "memory_action_error");
  assert.equal(error.action, "codex-run");
  assert.equal(error.error.exitCode, 7);
  assert.equal(error.error.sessionFile, sessionFile);
  assert.ok(error.error.writebackInputFile.endsWith(".writeback.txt"));
  assert.ok(existsSync(sessionFile), "expected raw session log on failure");
  assert.ok(existsSync(error.error.writebackInputFile), "expected derived writeback file on failure");

  const rawSessionLog = readFileSync(sessionFile, "utf-8");
  assert.match(rawSessionLog, /preserve the original Codex CLI exit code/);
  const writebackInput = readFileSync(error.error.writebackInputFile, "utf-8");
  assert.match(writebackInput, /Exit code: 7/);
  assert.match(writebackInput, /intentional failing command for exit-code validation/);

  const review = JSON.parse(runCli(["review"], { env }).stdout);
  assert.ok(
    review.items.some((item) =>
      item.content.includes("preserve the original Codex CLI exit code")
    ),
    "expected failure output to still write back via the derived input file"
  );

  rmSync(tempRoot, { recursive: true, force: true });
});

test("writeback skips markdown structure noise while keeping useful memories", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-markdown-"));
  const memoryHome = path.join(tempRoot, "memory-home");
  const sessionFile = path.join(tempRoot, "memory.md");

  writeFileSync(
    sessionFile,
    [
      "## User preferences",
      "Preference signals:",
      "- Default to the simplest runnable implementation first; avoid overengineering and keep files/functions small when possible.",
      "- `tests/run-tests.js` is the verification gate; `node /Users/ironion/workspace/sleep-rank/tests/run-tests.js` passed after major refactors.",
      "The root cause is parser state drift across repeated retries in the app worker.",
    ].join("\n")
  );

  const env = { OAZEN_HOME: memoryHome };
  const writebackResult = JSON.parse(
    runCli(["writeback", "--file", sessionFile, "--scope", "global"], { env }).stdout
  );

  assert.equal(writebackResult.kind, "memory_mutation_result");
  assert.equal(writebackResult.action, "writeback");
  assert.equal(writebackResult.counts.created, 3);

  const createdContents = writebackResult.changes.map((change) => change.after?.content ?? "");
  assert.ok(
    createdContents.some((content) =>
      content.includes("Default to the simplest runnable implementation first")
    )
  );
  assert.ok(
    createdContents.some((content) =>
      content.includes("tests/run-tests.js") && content.includes("[redacted-path]")
    )
  );
  assert.ok(
    createdContents.some((content) =>
      content.includes("parser state drift across repeated retries")
    )
  );
  assert.ok(createdContents.every((content) => content !== "## User preferences"));
  assert.ok(createdContents.every((content) => content !== "Preference signals:"));

  rmSync(tempRoot, { recursive: true, force: true });
});

test("reject, merge, and forget return machine-readable mutation contracts", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-contracts-"));
  const memoryHome = path.join(tempRoot, "memory-home");
  const now = Date.now();
  const day = 1000 * 60 * 60 * 24;
  const memories = [
    {
      id: "pending-1",
      layer: "inbox",
      kind: "workflow",
      scope: "repo",
      scopeKey: "repo:/tmp/demo",
      title: "Pending workflow",
      content: "Run the retry workflow after parser resets.",
      tags: [],
      source: "derived",
      strength: 0.55,
      accessCount: 0,
      lastAccessedAt: now,
      createdAt: now,
      updatedAt: now,
      stability: "stable",
      status: "active",
      reviewState: "pending",
      sensitivity: "safe",
      sensitivityReasons: [],
      restrictedToInbox: false,
    },
    {
      id: "fact-a",
      layer: "fact",
      kind: "fact",
      scope: "repo",
      scopeKey: "repo:/tmp/demo",
      title: "Parser drift root cause",
      content: "The root cause is parser state drift in retry orchestration.",
      tags: [],
      source: "derived",
      strength: 0.7,
      accessCount: 2,
      lastAccessedAt: now,
      createdAt: now - day,
      updatedAt: now - day,
      stability: "stable",
      status: "active",
      reviewState: "approved",
      sensitivity: "safe",
      sensitivityReasons: [],
      restrictedToInbox: false,
    },
    {
      id: "fact-b",
      layer: "fact",
      kind: "fact",
      scope: "repo",
      scopeKey: "repo:/tmp/demo",
      title: "Parser drift cause",
      content: "The root cause is parser state drift in retry orchestration.",
      tags: ["parser"],
      source: "derived",
      strength: 0.5,
      accessCount: 1,
      lastAccessedAt: now,
      createdAt: now - day,
      updatedAt: now,
      stability: "stable",
      status: "active",
      reviewState: "approved",
      sensitivity: "safe",
      sensitivityReasons: [],
      restrictedToInbox: false,
    },
    {
      id: "old-fact",
      layer: "fact",
      kind: "fact",
      scope: "repo",
      scopeKey: "repo:/tmp/demo",
      title: "Old stale fact",
      content: "The root cause is stale and no longer useful.",
      tags: [],
      source: "derived",
      strength: 0.01,
      accessCount: 0,
      lastAccessedAt: now - day * 120,
      createdAt: now - day * 150,
      updatedAt: now - day * 120,
      stability: "stable",
      status: "active",
      reviewState: "approved",
      sensitivity: "safe",
      sensitivityReasons: [],
      restrictedToInbox: false,
    },
  ];

  mkdirSync(path.join(memoryHome, "data"), { recursive: true });
  writeFileSync(path.join(memoryHome, "data", "memories.json"), JSON.stringify(memories, null, 2));

  const env = { OAZEN_HOME: memoryHome };

  const rejectResult = JSON.parse(runCli(["reject", "pending-1"], { env }).stdout);
  assert.equal(rejectResult.kind, "memory_mutation_result");
  assert.equal(rejectResult.action, "reject");
  assert.equal(rejectResult.changes[0].after.status, "rejected");

  const mergeResult = JSON.parse(runCli(["merge"], { env }).stdout);
  assert.equal(mergeResult.kind, "memory_mutation_result");
  assert.equal(mergeResult.action, "merge");
  assert.ok(mergeResult.counts.changed >= 2);
  assert.ok(mergeResult.changes.some((change) => change.after.id === "fact-a" || change.after.id === "fact-b"));
  assert.ok(mergeResult.changes.some((change) => change.after.status === "archived"));

  const forgetResult = JSON.parse(runCli(["forget"], { env }).stdout);
  assert.equal(forgetResult.kind, "memory_mutation_result");
  assert.equal(forgetResult.action, "forget");
  assert.ok(forgetResult.changes.some((change) => change.after.id === "old-fact"));
  assert.ok(forgetResult.changes.some((change) => change.after.status === "archived"));

  rmSync(tempRoot, { recursive: true, force: true });
});

test("review and merge surface conflicts for contradictory same-scope memories", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-conflicts-"));
  const memoryHome = path.join(tempRoot, "memory-home");
  const now = Date.now();
  const memories = [
    {
      id: "pending-positive",
      layer: "inbox",
      kind: "workflow",
      scope: "repo",
      scopeKey: "repo:/tmp/conflicts",
      title: "Use read-back verification",
      content: "Always use gomokuGetProfile read-back verification before treating auth as complete.",
      tags: [],
      source: "derived",
      strength: 0.7,
      accessCount: 0,
      lastAccessedAt: now,
      createdAt: now,
      updatedAt: now,
      stability: "stable",
      status: "active",
      reviewState: "pending",
      sensitivity: "safe",
      sensitivityReasons: [],
      restrictedToInbox: false,
    },
    {
      id: "approved-negative",
      layer: "session",
      kind: "workflow",
      scope: "repo",
      scopeKey: "repo:/tmp/conflicts",
      title: "Skip read-back verification",
      content: "Do not use gomokuGetProfile read-back verification before treating auth as complete.",
      tags: [],
      source: "derived",
      strength: 0.8,
      accessCount: 0,
      lastAccessedAt: now,
      createdAt: now,
      updatedAt: now,
      stability: "stable",
      status: "active",
      reviewState: "approved",
      sensitivity: "safe",
      sensitivityReasons: [],
      restrictedToInbox: false,
    },
  ];

  mkdirSync(path.join(memoryHome, "data"), { recursive: true });
  writeFileSync(path.join(memoryHome, "data", "memories.json"), JSON.stringify(memories, null, 2));

  const env = { OAZEN_HOME: memoryHome };
  const review = JSON.parse(runCli(["review"], { env }).stdout);
  assert.equal(review.counts.conflicts, 1);
  assert.equal(review.conflicts.length, 1);
  assert.deepEqual(review.conflicts[0].memoryIds, ["pending-positive", "approved-negative"]);
  assert.deepEqual(review.items[0].conflictsWith, ["approved-negative"]);

  const merge = JSON.parse(runCli(["merge"], { env }).stdout);
  assert.equal(merge.kind, "memory_mutation_result");
  assert.equal(merge.action, "merge");
  assert.equal(merge.conflicts.length, 1);
  assert.deepEqual(merge.conflicts[0].memoryIds, ["pending-positive", "approved-negative"]);

  rmSync(tempRoot, { recursive: true, force: true });
});

test("compact returns the same mutation envelope with created and archived changes", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-compact-"));
  const memoryHome = path.join(tempRoot, "memory-home");
  const now = Date.now();
  const day = 1000 * 60 * 60 * 24;
  const memories = [
    {
      id: "session-1",
      layer: "session",
      kind: "workflow",
      scope: "repo",
      scopeKey: "repo:/tmp/demo",
      title: "Retry workflow one",
      content: "Run retry workflow after parser reset and reload state.",
      tags: ["retry"],
      source: "derived",
      strength: 0.5,
      accessCount: 1,
      lastAccessedAt: now,
      createdAt: now - day,
      updatedAt: now - day,
      stability: "stable",
      status: "active",
      reviewState: "approved",
      sensitivity: "safe",
      sensitivityReasons: [],
      restrictedToInbox: false,
    },
    {
      id: "session-2",
      layer: "session",
      kind: "workflow",
      scope: "repo",
      scopeKey: "repo:/tmp/demo",
      title: "Retry workflow two",
      content: "Run retry workflow after parser reset and reload state.",
      tags: ["retry", "parser"],
      source: "derived",
      strength: 0.52,
      accessCount: 2,
      lastAccessedAt: now,
      createdAt: now - day,
      updatedAt: now - day,
      stability: "stable",
      status: "active",
      reviewState: "approved",
      sensitivity: "safe",
      sensitivityReasons: [],
      restrictedToInbox: false,
    },
    {
      id: "session-3",
      layer: "session",
      kind: "preference",
      scope: "repo",
      scopeKey: "repo:/tmp/demo",
      title: "Retry workflow three",
      content: "Run retry workflow after parser reset and reload state.",
      tags: ["retry"],
      source: "derived",
      strength: 0.48,
      accessCount: 0,
      lastAccessedAt: now,
      createdAt: now - day,
      updatedAt: now - day,
      stability: "stable",
      status: "active",
      reviewState: "approved",
      sensitivity: "safe",
      sensitivityReasons: [],
      restrictedToInbox: false,
    },
  ];

  mkdirSync(path.join(memoryHome, "data"), { recursive: true });
  writeFileSync(path.join(memoryHome, "data", "memories.json"), JSON.stringify(memories, null, 2));

  const env = { OAZEN_HOME: memoryHome };
  const compactResult = JSON.parse(runCli(["compact"], { env }).stdout);

  assert.equal(compactResult.kind, "memory_mutation_result");
  assert.equal(compactResult.action, "compact");
  assert.equal(compactResult.counts.created, 1);
  assert.equal(compactResult.counts.archived, 3);
  assert.ok(compactResult.changes.some((change) => change.before === null && change.after?.title.startsWith("Compressed:")));
  assert.ok(compactResult.changes.some((change) => change.after?.status === "archived"));

  rmSync(tempRoot, { recursive: true, force: true });
});

test("project scope stays isolated and outranks repo scope during recall", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-scope-"));
  const memoryHome = path.join(tempRoot, "memory-home");
  const fakeRepo = path.join(tempRoot, "workspace");
  const projectA = path.join(fakeRepo, "packages", "app-a");
  const projectB = path.join(fakeRepo, "packages", "app-b");
  const now = Date.now();

  mkdirSync(path.join(fakeRepo, ".git"), { recursive: true });
  mkdirSync(projectA, { recursive: true });
  mkdirSync(projectB, { recursive: true });
  writeFileSync(path.join(fakeRepo, "package.json"), '{"name":"root"}');
  writeFileSync(path.join(projectA, "package.json"), '{"name":"app-a"}');
  writeFileSync(path.join(projectB, "package.json"), '{"name":"app-b"}');

  const memories = [
    {
      id: "project-a-memory",
      layer: "fact",
      kind: "fact",
      scope: "project",
      scopeKey: `project:${projectA}`,
      scopePath: projectA,
      title: "App A parser retries",
      content: "The root cause is parser retries drifting only in app-a workers.",
      tags: ["parser", "retry"],
      source: "derived",
      strength: 0.7,
      accessCount: 1,
      lastAccessedAt: now,
      createdAt: now,
      updatedAt: now,
      stability: "stable",
      status: "active",
      reviewState: "approved",
      sensitivity: "safe",
      sensitivityReasons: [],
      restrictedToInbox: false,
    },
    {
      id: "repo-memory",
      layer: "fact",
      kind: "fact",
      scope: "repo",
      scopeKey: `repo:${fakeRepo}`,
      scopePath: fakeRepo,
      title: "Repo parser retries",
      content: "The root cause is parser retries affecting the shared worker pool.",
      tags: ["parser", "retry"],
      source: "derived",
      strength: 0.65,
      accessCount: 1,
      lastAccessedAt: now,
      createdAt: now,
      updatedAt: now,
      stability: "stable",
      status: "active",
      reviewState: "approved",
      sensitivity: "safe",
      sensitivityReasons: [],
      restrictedToInbox: false,
    },
  ];

  mkdirSync(path.join(memoryHome, "data"), { recursive: true });
  writeFileSync(path.join(memoryHome, "data", "memories.json"), JSON.stringify(memories, null, 2));

  const env = { OAZEN_HOME: memoryHome };

  const recallA = JSON.parse(
    runCli(["recall", "parser retries in app-a workers", "--cwd", projectA], { env }).stdout
  );
  assert.equal(recallA.memories[0].id, "project-a-memory");
  assert.ok(recallA.memories.some((memory) => memory.id === "repo-memory"));

  const recallB = JSON.parse(
    runCli(["recall", "parser retries in app-a workers", "--cwd", projectB], { env }).stdout
  );
  assert.ok(recallB.memories.every((memory) => memory.id !== "project-a-memory"));
  assert.ok(recallB.memories.some((memory) => memory.id === "repo-memory"));

  rmSync(tempRoot, { recursive: true, force: true });
});

test("parallel approve commands do not lose updates", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-lock-"));
  const memoryHome = path.join(tempRoot, "memory-home");
  const now = Date.now();
  const memories = [
    {
      id: "approve-1",
      layer: "inbox",
      kind: "fact",
      scope: "global",
      scopeKey: "global",
      title: "Approve one",
      content: "The root cause is parser drift in flow one.",
      tags: [],
      source: "derived",
      strength: 0.55,
      accessCount: 0,
      lastAccessedAt: now,
      createdAt: now,
      updatedAt: now,
      stability: "stable",
      status: "active",
      reviewState: "pending",
      sensitivity: "safe",
      sensitivityReasons: [],
      restrictedToInbox: false,
    },
    {
      id: "approve-2",
      layer: "inbox",
      kind: "fact",
      scope: "global",
      scopeKey: "global",
      title: "Approve two",
      content: "The root cause is parser drift in flow two.",
      tags: [],
      source: "derived",
      strength: 0.55,
      accessCount: 0,
      lastAccessedAt: now,
      createdAt: now,
      updatedAt: now,
      stability: "stable",
      status: "active",
      reviewState: "pending",
      sensitivity: "safe",
      sensitivityReasons: [],
      restrictedToInbox: false,
    },
    {
      id: "approve-3",
      layer: "inbox",
      kind: "fact",
      scope: "global",
      scopeKey: "global",
      title: "Approve three",
      content: "The root cause is parser drift in flow three.",
      tags: [],
      source: "derived",
      strength: 0.55,
      accessCount: 0,
      lastAccessedAt: now,
      createdAt: now,
      updatedAt: now,
      stability: "stable",
      status: "active",
      reviewState: "pending",
      sensitivity: "safe",
      sensitivityReasons: [],
      restrictedToInbox: false,
    },
  ];

  mkdirSync(path.join(memoryHome, "data"), { recursive: true });
  writeFileSync(path.join(memoryHome, "data", "memories.json"), JSON.stringify(memories, null, 2));

  const env = { OAZEN_HOME: memoryHome };

  const approvals = await Promise.all([
    runCliAsync(["approve", "approve-1"], { env }),
    runCliAsync(["approve", "approve-2"], { env }),
    runCliAsync(["approve", "approve-3"], { env }),
  ]);

  for (const approval of approvals) {
    const result = JSON.parse(approval.stdout);
    assert.equal(result.kind, "memory_mutation_result");
    assert.equal(result.action, "approve");
    assert.equal(result.changes[0].after.layer, "session");
  }

  const stored = JSON.parse(readFileSync(path.join(memoryHome, "data", "memories.json"), "utf-8"));
  assert.equal(
    stored.filter((memory) => memory.layer === "session" && memory.reviewState === "approved").length,
    3
  );

  const promoteResult = JSON.parse(runCli(["promote", "approve-2"], { env }).stdout);
  assert.equal(promoteResult.kind, "memory_mutation_result");
  assert.equal(promoteResult.action, "promote");
  assert.equal(promoteResult.changes[0].before.layer, "session");
  assert.equal(promoteResult.changes[0].after.layer, "fact");

  rmSync(tempRoot, { recursive: true, force: true });
});

test("stale incomplete lock file does not block future mutations", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "oazen-stale-lock-"));
  const memoryHome = path.join(tempRoot, "memory-home");
  const dataDir = path.join(memoryHome, "data");
  const memoryFile = path.join(dataDir, "memories.json");
  const lockFile = `${memoryFile}.lock`;
  const now = Date.now();

  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    memoryFile,
    JSON.stringify(
      [
        {
          id: "stale-lock-memory",
          layer: "inbox",
          kind: "fact",
          scope: "global",
          scopeKey: "global",
          title: "Stale lock memory",
          content: "The root cause is stale lock recovery.",
          tags: [],
          source: "derived",
          strength: 0.55,
          accessCount: 0,
          lastAccessedAt: now,
          createdAt: now,
          updatedAt: now,
          stability: "stable",
          status: "active",
          reviewState: "pending",
          sensitivity: "safe",
          sensitivityReasons: [],
          restrictedToInbox: false,
        },
      ],
      null,
      2
    )
  );

  writeFileSync(lockFile, "");
  utimesSync(lockFile, (now - 5000) / 1000, (now - 5000) / 1000);

  const env = { OAZEN_HOME: memoryHome };
  const approveResult = JSON.parse(runCli(["approve", "stale-lock-memory"], { env }).stdout);

  assert.equal(approveResult.kind, "memory_mutation_result");
  assert.equal(approveResult.action, "approve");
  assert.equal(approveResult.changes[0].after.layer, "session");
  assert.equal(existsSync(lockFile), false);

  rmSync(tempRoot, { recursive: true, force: true });
});
