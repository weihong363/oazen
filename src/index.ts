#!/usr/bin/env node
import { Command } from "commander";
import { formatCodexContextPacket } from "./adapter";
import { approveMemory } from "./approve";
import { buildCliActionError } from "./contracts";
import { recall } from "./recall";
import { writebackFromFile } from "./writeback";
import { loadMemories } from "./memory-store";
import { listInbox } from "./review";
import { promoteMemory } from "./promote";
import { rejectMemory } from "./reject";
import { compressMemories } from "./compress";
import { forgetWeakMemories } from "./forget";
import { mergeRelatedMemories } from "./merge";
import { MemoryScope } from "./types";

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
  .action(async () => {
    await runCliAction("review", async () => {
      const result = await listInbox();
      console.log(JSON.stringify(result, null, 2));
    });
  });

program
  .command("approve")
  .argument("<id>", "memory id")
  .action(async (id) => {
    await runCliAction("approve", async () => {
      const result = await approveMemory(id);
      console.log(JSON.stringify(result, null, 2));
    });
  });

program
  .command("promote")
  .argument("<id>", "memory id")
  .action(async (id) => {
    await runCliAction("promote", async () => {
      const result = await promoteMemory(id);
      console.log(JSON.stringify(result, null, 2));
    });
  });

program
  .command("reject")
  .argument("<id>", "memory id")
  .action(async (id) => {
    await runCliAction("reject", async () => {
      const result = await rejectMemory(id);
      console.log(JSON.stringify(result, null, 2));
    });
  });

program
  .command("compact")
  .action(async () => {
    const result = await compressMemories();
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("merge")
  .action(async () => {
    await runCliAction("merge", async () => {
      const result = await mergeRelatedMemories();
      console.log(JSON.stringify(result, null, 2));
    });
  });

program
  .command("forget")
  .action(async () => {
    await runCliAction("forget", async () => {
      const result = await forgetWeakMemories();
      console.log(JSON.stringify(result, null, 2));
    });
  });

program
  .command("list")
  .action(async () => {
    const memories = await loadMemories();
    console.log(JSON.stringify(memories, null, 2));
  });

program.parseAsync().catch((error) => {
  console.error(error);
  process.exit(1);
});
