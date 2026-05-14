import { createWriteStream } from "fs";
import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
import {
  applyCodexTemplateToArgs,
  formatCodexContextPacket,
  writeCodexContextPacket,
} from "../adapters/codex";
import { recall } from "./recall";
import { writebackFromFile } from "./writeback";
import { CodexSidecarResult, MemoryMutationResult } from "../core/types";

export type CodexPreloadOptions = {
  cwd?: string;
  packetFile?: string;
};

export type CodexRunOptions = CodexPreloadOptions & {
  sessionFile?: string;
  command: string[];
  skipWriteback?: boolean;
};

export type CodexInteractiveOptions = CodexPreloadOptions & {
  sessionFile?: string;
  task?: string;
  command?: string[];
  skipWriteback?: boolean;
};

const DEFAULT_INTERACTIVE_TASK = "continue work in this project";

type CodexCommandExecution = {
  command: string[];
  requestedCommand: string[];
  exitCode: number;
  stdoutBytes: number;
  stderrBytes: number;
  terminalMode: "pty" | "pipe";
};

class CodexRunError extends Error {
  exitCode: number;
  sessionFile: string;
  writebackInputFile: string;

  constructor(message: string, options: { exitCode: number; sessionFile: string; writebackInputFile: string }) {
    super(message);
    this.name = "CodexRunError";
    this.exitCode = options.exitCode;
    this.sessionFile = options.sessionFile;
    this.writebackInputFile = options.writebackInputFile;
  }
}

function buildDefaultSessionFile(cwd: string): string {
  return path.join(cwd, "sessions", `codex-${Date.now()}.log`);
}

function buildDefaultWritebackInputFile(rawSessionFile: string): string {
  return `${rawSessionFile}.writeback.txt`;
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildPtyCommand(
  sessionFile: string,
  commandName: string,
  commandArgs: string[]
): { command: string; args: string[] } {
  if (
    process.platform === "darwin" ||
    process.platform === "freebsd" ||
    process.platform === "openbsd" ||
    process.platform === "netbsd"
  ) {
    return {
      command: "script",
      args: ["-q", sessionFile, commandName, ...commandArgs],
    };
  }

  const wrappedCommand = [commandName, ...commandArgs].map(shellEscape).join(" ");
  return {
    command: "script",
    args: ["-q", "-e", "-c", wrappedCommand, sessionFile],
  };
}

function shouldUsePty(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY);
}

function sanitizeWritebackInput(raw: string): string {
  const maxChars = 24000;
  const maxLines = 400;
  const normalized = raw.replace(/\0/g, "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n").slice(0, maxLines);
  const clipped = lines.join("\n");
  return clipped.length <= maxChars ? clipped : clipped.slice(0, maxChars);
}

async function buildWritebackInputFile(
  rawSessionFile: string,
  writebackInputFile: string,
  details: { task: string; cwd: string; exitCode: number; command: string[] }
): Promise<string> {
  const raw = await fs.readFile(rawSessionFile, "utf-8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const sanitized = sanitizeWritebackInput(raw);
  const content = [
    `Task: ${details.task}`,
    `Cwd: ${details.cwd}`,
    `Exit code: ${details.exitCode}`,
    `Command: ${details.command.join(" ")}`,
    "",
    "--- Captured output ---",
    sanitized,
  ].join("\n");

  await fs.mkdir(path.dirname(writebackInputFile), { recursive: true });
  await fs.writeFile(writebackInputFile, content, "utf-8");
  return writebackInputFile;
}

async function runCommandWithPipes(
  commandName: string,
  commandArgs: string[],
  requestedCommand: string[],
  cwd: string,
  sessionFile: string,
  env: NodeJS.ProcessEnv
): Promise<CodexCommandExecution> {
  return await new Promise<CodexCommandExecution>((resolve, reject) => {
    const output = createWriteStream(sessionFile, { flags: "w" });
    const child = spawn(commandName, commandArgs, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      output.end(() => reject(error));
    };

    child.on("error", fail);
    child.stdout?.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      stdoutBytes += buffer.byteLength;
      output.write(buffer);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      stderrBytes += buffer.byteLength;
      output.write(buffer);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      output.end(() =>
        resolve({
          command: [commandName, ...commandArgs],
          requestedCommand,
          exitCode: code ?? 1,
          stdoutBytes,
          stderrBytes,
          terminalMode: "pipe",
        })
      );
    });
  });
}

async function runCommandWithPty(
  commandName: string,
  commandArgs: string[],
  requestedCommand: string[],
  cwd: string,
  sessionFile: string,
  env: NodeJS.ProcessEnv
): Promise<CodexCommandExecution> {
  const ptyCommand = buildPtyCommand(sessionFile, commandName, commandArgs);

  return await new Promise<CodexCommandExecution>((resolve, reject) => {
    const child = spawn(ptyCommand.command, ptyCommand.args, {
      cwd,
      env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", async (code) => {
      const stats = await fs.stat(sessionFile).catch(() => null);
      resolve({
        command: [commandName, ...commandArgs],
        requestedCommand,
        exitCode: code ?? 1,
        stdoutBytes: stats?.size ?? 0,
        stderrBytes: 0,
        terminalMode: "pty",
      });
    });
  });
}

async function runCommandToSessionFile(
  command: string[],
  cwd: string,
  sessionFile: string,
  packet: string,
  packetFile: string,
  task: string
): Promise<CodexCommandExecution> {
  if (command.length === 0) {
    throw new Error("Codex run requires a command after '--'");
  }

  await fs.mkdir(path.dirname(sessionFile), { recursive: true });

  const [commandName, ...commandArgs] = applyCodexTemplateToArgs(command, {
    task,
    cwd,
    packet,
    packetFile,
    sessionFile,
  });
  const env = {
    ...process.env,
    OAZEN_TASK: task,
    OAZEN_CONTEXT_PACKET: packet,
    OAZEN_CONTEXT_FILE: packetFile,
    OAZEN_SESSION_FILE: sessionFile,
  };

  if (shouldUsePty()) {
    return await runCommandWithPty(commandName, commandArgs, [...command], cwd, sessionFile, env);
  }

  return await runCommandWithPipes(commandName, commandArgs, [...command], cwd, sessionFile, env);
}

function buildCodexSidecarResult(
  action: "preload" | "run",
  payload: Omit<CodexSidecarResult, "version" | "kind" | "action" | "timestamp">
): CodexSidecarResult {
  return {
    version: "1",
    kind: "codex_sidecar_result",
    action,
    timestamp: Date.now(),
    ...payload,
  };
}

export async function codexPreload(
  task: string,
  options: CodexPreloadOptions = {}
): Promise<CodexSidecarResult> {
  const recallResult = await recall(task, { cwd: options.cwd });
  const packet = formatCodexContextPacket(recallResult);
  const packetFile = await writeCodexContextPacket(packet, options.packetFile);

  return buildCodexSidecarResult("preload", {
    task,
    cwd: recallResult.scope.cwd,
    packet,
    packetFile,
    selectedMemoryIds: recallResult.selected.map((memory) => memory.id),
    recall: recallResult,
  });
}

export async function codexRun(
  task: string,
  options: CodexRunOptions
): Promise<CodexSidecarResult> {
  const preload = await codexPreload(task, options);
  const rawSessionFile = path.resolve(
    options.sessionFile ?? buildDefaultSessionFile(preload.cwd)
  );
  const writebackInputFile = path.resolve(buildDefaultWritebackInputFile(rawSessionFile));
  const execution = await runCommandToSessionFile(
    options.command,
    preload.cwd,
    rawSessionFile,
    preload.packet,
    preload.packetFile,
    task
  );
  await buildWritebackInputFile(rawSessionFile, writebackInputFile, {
    task,
    cwd: preload.cwd,
    exitCode: execution.exitCode,
    command: execution.command,
  });

  let writeback: MemoryMutationResult | undefined;

  if (!options.skipWriteback) {
    writeback = await writebackFromFile(writebackInputFile, { cwd: preload.cwd });
  }

  if (execution.exitCode !== 0) {
    throw new CodexRunError(
      `Codex command failed with exit code ${execution.exitCode}. Session log saved to ${rawSessionFile}`,
      {
        exitCode: execution.exitCode,
        sessionFile: rawSessionFile,
        writebackInputFile,
      }
    );
  }

  return buildCodexSidecarResult("run", {
    task,
    cwd: preload.cwd,
    packet: preload.packet,
    packetFile: preload.packetFile,
    selectedMemoryIds: preload.selectedMemoryIds,
    recall: preload.recall,
    sessionFile: rawSessionFile,
    rawSessionFile,
    writebackInputFile,
    execution: {
      command: execution.command,
      requestedCommand: execution.requestedCommand,
      rawSessionFile,
      exitCode: execution.exitCode,
      stdoutBytes: execution.stdoutBytes,
      stderrBytes: execution.stderrBytes,
      terminalMode: execution.terminalMode,
    },
    writeback,
  });
}

export async function codexInteractive(
  options: CodexInteractiveOptions = {}
): Promise<CodexSidecarResult> {
  const task = options.task ?? DEFAULT_INTERACTIVE_TASK;
  const command = options.command?.length
    ? options.command
    : [
        "codex",
        "{packet}\n\nContinue working in this project. Ask me what to do next.",
      ];

  return await codexRun(task, {
    cwd: options.cwd,
    packetFile: options.packetFile,
    sessionFile: options.sessionFile,
    skipWriteback: options.skipWriteback,
    command,
  });
}
