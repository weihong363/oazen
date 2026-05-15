import { Command } from "commander";
import { formatCodexContextPacket } from "../adapters/codex";
import { approveMemory } from "../commands/approve";
import { compressMemories } from "../commands/compress";
import { codexInteractive, codexPreload, codexRun } from "../commands/codex";
import { forgetWeakMemories } from "../commands/forget";
import { mergeRelatedMemories } from "../commands/merge";
import { promoteMemory } from "../commands/promote";
import { recall } from "../commands/recall";
import { rejectMemory } from "../commands/reject";
import { listInbox } from "../commands/review";
import { writebackFromFile } from "../commands/writeback";
import { buildCliActionError } from "../core/contracts";
import { compareBenchmarkReports } from "../eval/compare-reports";
import { MemoryScope } from "../core/types";
import { runCodexHookCommand, parseCodexHookName } from "./hookCommands";
import { installCodex, parseInstallScope, uninstallCodex } from "./installCommands";
import { addProjectMemory, compactProjectMemories, listProjectMemories, showProjectMemory } from "./memoryCommands";
import { loadMemories } from "../storage/memory-store";
import { ProjectResolver } from "../project/ProjectResolver";
import { MemoryStore } from "../memory/MemoryStore";
import { importCodexMemories } from "../import/CodexMemoryImporter";

function countByBranch(records: Array<{ branch?: string }>): Record<string, number> {
  return records.reduce<Record<string, number>>((counts, record) => {
    const branch = record.branch ?? "unknown";
    counts[branch] = (counts[branch] ?? 0) + 1;
    return counts;
  }, {});
}

function parseImportScope(scope: string): "project" {
  if (scope !== "project") throw new Error(`Unsupported import scope: ${scope}`);
  return "project";
}

const program = new Command();

async function runCliAction(action: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error(JSON.stringify(buildCliActionError(action, error), null, 2));
    const exitCode =
      typeof error === "object" && error !== null && "exitCode" in error
        ? Number((error as { exitCode?: unknown }).exitCode)
        : 1;
    process.exit(Number.isFinite(exitCode) ? exitCode : 1);
  }
}

program
  .name("oazen")
  .description("Local memory runtime for coding agents");

program
  .command("recall")
  .description("Recall relevant memories before task execution")
  .argument("<task>", "task description")
  .option("--cwd <path>", "scope inference cwd")
  .option("--format <format>", "output format: json or codex", "json")
  .action(async (task, options) => {
    await runCliAction("recall", async () => {
      const result = await recall(task, { cwd: options.cwd });
      if (options.format === "codex") {
        console.log(formatCodexContextPacket(result));
        return;
      }
      console.log(JSON.stringify(result, null, 2));
    });
  });

program
  .command("writeback")
  .description("Write back useful learnings from session logs to memory")
  .requiredOption("-f, --file <path>", "session file path")
  .option("--cwd <path>", "scope inference cwd")
  .option("--scope <scope>", "writeback scope: auto, global, project, repo", "auto")
  .action(async (options) => {
    await runCliAction("writeback", async () => {
      const result = await writebackFromFile(options.file, {
        cwd: options.cwd,
        scope: options.scope as MemoryScope | "auto",
      });
      console.log(JSON.stringify(result, null, 2));
    });
  });

const codexProgram = program.command("codex").description("Codex sidecar workflow helpers");
const evalProgram = program.command("eval").description("Benchmark and evaluation helpers");
const hookProgram = program.command("hook").description("Agent hook entrypoints");
const installProgram = program.command("install").description("Install agent hook configuration");
const uninstallProgram = program.command("uninstall").description("Uninstall agent hook configuration");
const memoryProgram = program.command("memory").description("Project-scoped hook memory");
const importProgram = program.command("import").description("Import local agent memories");

hookProgram
  .command("codex")
  .description("Run a Codex hook adapter command")
  .argument("<event>", "session-start, user-prompt-submit, stop, pre-tool-use, post-tool-use, permission-request")
  .action(async (event) => {
    await runCodexHookCommand(parseCodexHookName(event));
  });

installProgram
  .command("codex")
  .description("Install Codex hook configuration")
  .option("--scope <scope>", "project or user", "project")
  .action(async (options) => {
    await runCliAction("install-codex", async () => {
      const result = await installCodex(parseInstallScope(options.scope));
      console.log(JSON.stringify(result, null, 2));
    });
  });

uninstallProgram
  .command("codex")
  .description("Uninstall Oazen-managed Codex hook configuration")
  .option("--scope <scope>", "project or user", "project")
  .action(async (options) => {
    await runCliAction("uninstall-codex", async () => {
      const result = await uninstallCodex(parseInstallScope(options.scope));
      console.log(JSON.stringify(result, null, 2));
    });
  });

program
  .command("doctor")
  .description("Check Oazen hook runtime basics")
  .option("--cwd <path>", "project cwd")
  .action(async (options) => {
    await runCliAction("doctor", async () => {
      const project = new ProjectResolver().resolve(options.cwd);
      const memoryStore = new MemoryStore();
      const allRecords = await memoryStore.list();
      const projectRecords = allRecords.filter((record) => record.projectId === project.projectId);
      console.log(JSON.stringify({
        version: "1",
        kind: "doctor_result",
        cwd: project.cwd,
        project,
        memoryFilePath: memoryStore.getFilePath(),
        recordsLoaded: allRecords.length,
        projectRecordsLoaded: projectRecords.length,
        projectBranchCounts: countByBranch(projectRecords),
        node: process.version,
        strictMode: false,
        network: "disabled-by-default",
      }, null, 2));
    });
  });

memoryProgram
  .command("list")
  .description("List project-scoped hook memories")
  .option("--cwd <path>", "project cwd")
  .action(async (options) => {
    await runCliAction("memory-list", async () => {
      console.log(JSON.stringify(await listProjectMemories(options.cwd), null, 2));
    });
  });

memoryProgram
  .command("show")
  .description("Show one project-scoped hook memory")
  .argument("<id>", "memory id")
  .action(async (id) => {
    await runCliAction("memory-show", async () => {
      console.log(JSON.stringify(await showProjectMemory(id), null, 2));
    });
  });

memoryProgram
  .command("add")
  .description("Add one project-scoped hook memory")
  .argument("<content>", "memory content")
  .option("--cwd <path>", "project cwd")
  .option("--type <type>", "project memory type", "file_note")
  .option("--tags <tags>", "comma-separated tags")
  .action(async (content, options) => {
    await runCliAction("memory-add", async () => {
      console.log(JSON.stringify(await addProjectMemory(content, options), null, 2));
    });
  });

memoryProgram
  .command("compact")
  .description("Compact project-scoped hook memories")
  .option("--cwd <path>", "project cwd")
  .option("--strategy <strategy>", "compact strategy: sort or layered", "sort")
  .action(async (options) => {
    await runCliAction("memory-compact", async () => {
      console.log(JSON.stringify(await compactProjectMemories({
        cwd: options.cwd,
        strategy: options.strategy,
      }), null, 2));
    });
  });

importProgram
  .command("codex")
  .description("Import existing Codex memories into project-scoped Oazen memory")
  .option("--scope <scope>", "import scope: project", "project")
  .option("--cwd <path>", "project cwd")
  .option("--source-dir <path>", "Codex memories directory")
  .option("--dry-run", "show candidate imports without writing")
  .action(async (options) => {
    await runCliAction("import-codex", async () => {
      console.log(JSON.stringify(await importCodexMemories({
        cwd: options.cwd,
        scope: parseImportScope(options.scope),
        sourceDir: options.sourceDir,
        dryRun: options.dryRun,
      }), null, 2));
    });
  });

codexProgram
  .command("interactive")
  .description("Preload project context and start an interactive Codex session")
  .argument("[command...]", "optional command to run after preload")
  .allowUnknownOption(true)
  .option("--cwd <path>", "scope inference cwd")
  .option("--task <task>", "recall task description", "continue work in this project")
  .option("--packet-file <path>", "write the packet to this path")
  .option("--session-file <path>", "write combined command output to this file")
  .option("--skip-writeback", "capture the log but skip writeback")
  .action(async (command, options) => {
    await runCliAction("codex-interactive", async () => {
      const result = await codexInteractive({
        cwd: options.cwd,
        task: options.task,
        packetFile: options.packetFile,
        sessionFile: options.sessionFile,
        skipWriteback: options.skipWriteback,
        command,
      });

      console.log(JSON.stringify(result, null, 2));
    });
  });

codexProgram
  .command("preload")
  .description("Recall context and emit a Codex-ready packet")
  .argument("<task>", "task description")
  .option("--cwd <path>", "scope inference cwd")
  .option("--packet-file <path>", "write the packet to this path")
  .option("--format <format>", "output format: packet or json", "packet")
  .action(async (task, options) => {
    await runCliAction("codex-preload", async () => {
      const result = await codexPreload(task, {
        cwd: options.cwd,
        packetFile: options.packetFile,
      });

      if (options.format === "json") {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(result.packet);
    });
  });

evalProgram
  .command("compare")
  .description("Compare two existing benchmark run reports")
  .argument("<baselineReport>", "baseline benchmark report path")
  .argument("<oazenReport>", "Oazen benchmark report path")
  .action(async (baselineReport, oazenReport) => {
    await runCliAction("eval-compare", async () => {
      const result = compareBenchmarkReports(baselineReport, oazenReport);
      console.log(JSON.stringify(result, null, 2));
    });
  });

codexProgram
  .command("run")
  .description("Preload Codex context, run a command, and write back the session log")
  .argument("<task>", "task description")
  .argument("[command...]", "command to run after preload")
  .allowUnknownOption(true)
  .option("--cwd <path>", "scope inference cwd")
  .option("--packet-file <path>", "write the packet to this path")
  .option("--session-file <path>", "write combined command output to this file")
  .option("--skip-writeback", "capture the log but skip writeback")
  .action(async (task, command, options) => {
    await runCliAction("codex-run", async () => {
      const result = await codexRun(task, {
        cwd: options.cwd,
        packetFile: options.packetFile,
        sessionFile: options.sessionFile,
        skipWriteback: options.skipWriteback,
        command,
      });

      console.log(JSON.stringify(result, null, 2));
    });
  });

program
  .command("review")
  .description("List inbox memories for review and approval")
  .action(async () => {
    await runCliAction("review", async () => {
      const result = await listInbox();
      console.log(JSON.stringify(result, null, 2));
    });
  });

program
  .command("approve")
  .description("Approve an inbox memory to promote it to session layer")
  .argument("<id>", "memory id")
  .action(async (id) => {
    await runCliAction("approve", async () => {
      const result = await approveMemory(id);
      console.log(JSON.stringify(result, null, 2));
    });
  });

program
  .command("promote")
  .description("Promote a session memory to fact or core layer")
  .argument("<id>", "memory id")
  .action(async (id) => {
    await runCliAction("promote", async () => {
      const result = await promoteMemory(id);
      console.log(JSON.stringify(result, null, 2));
    });
  });

program
  .command("reject")
  .description("Reject an inbox memory and remove it from the system")
  .argument("<id>", "memory id")
  .action(async (id) => {
    await runCliAction("reject", async () => {
      const result = await rejectMemory(id);
      console.log(JSON.stringify(result, null, 2));
    });
  });

program
  .command("compact")
  .description("Compress multiple related memories into denser summaries")
  .action(async () => {
    const result = await compressMemories();
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("merge")
  .description("Merge similar or duplicate memories to reduce redundancy")
  .action(async () => {
    await runCliAction("merge", async () => {
      const result = await mergeRelatedMemories();
      console.log(JSON.stringify(result, null, 2));
    });
  });

program
  .command("forget")
  .description("Forget weak or stale memories based on decay rules")
  .action(async () => {
    await runCliAction("forget", async () => {
      const result = await forgetWeakMemories();
      console.log(JSON.stringify(result, null, 2));
    });
  });

program
  .command("list")
  .description("List all memories in the system")
  .action(async () => {
    const memories = await loadMemories();
    console.log(JSON.stringify(memories, null, 2));
  });

export async function runCli(): Promise<void> {
  await program.parseAsync();
}
