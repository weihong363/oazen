import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
  assert.ok(recall.memories.length >= 1, "expected at least one recalled memory");
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
