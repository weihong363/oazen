import { Command } from "commander";
import { formatCodexContextPacket } from "../adapters/codex";
import { approveMemory } from "../commands/approve";
import { compressMemories } from "../commands/compress";
import { forgetWeakMemories } from "../commands/forget";
import { mergeRelatedMemories } from "../commands/merge";
import { promoteMemory } from "../commands/promote";
import { recall } from "../commands/recall";
import { rejectMemory } from "../commands/reject";
import { listInbox } from "../commands/review";
import { writebackFromFile } from "../commands/writeback";
import { buildCliActionError } from "../core/contracts";
import { MemoryScope } from "../core/types";
import { loadMemories } from "../storage/memory-store";

const program = new Command();

async function runCliAction(action: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error(JSON.stringify(buildCliActionError(action, error), null, 2));
    process.exit(1);
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
    const result = await recall(task, { cwd: options.cwd });
    if (options.format === "codex") {
      console.log(formatCodexContextPacket(result));
      return;
    }
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("writeback")
  .description("Write back useful learnings from session logs to memory")
  .requiredOption("-f, --file <path>", "session file path")
  .option("--cwd <path>", "scope inference cwd")
  .option("--scope <scope>", "writeback scope: auto, global, project, repo", "auto")
  .action(async (options) => {
    const result = await writebackFromFile(options.file, {
      cwd: options.cwd,
      scope: options.scope as MemoryScope | "auto",
    });
    console.log(JSON.stringify(result, null, 2));
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
