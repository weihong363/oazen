#!/usr/bin/env node
import { Command } from "commander";
import { recall } from "./recall";
import { writebackFromFile } from "./writeback";
import { loadMemories } from "./memory-store";
import { listInbox } from "./review";
import { promoteMemory } from "./promote";
import { rejectMemory } from "./reject";
import { compressMemories } from "./compress";
import { forgetWeakMemories } from "./forget";

const program = new Command();

program
  .name("oazen")
  .description("Local memory runtime for coding agents");

program
  .command("recall")
  .argument("<task>", "task description")
  .action(async (task) => {
    const result = await recall(task);
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("writeback")
  .requiredOption("-f, --file <path>", "session file path")
  .action(async (options) => {
    const result = await writebackFromFile(options.file);
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("review")
  .action(async () => {
    const result = await listInbox();
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("promote")
  .argument("<id>", "memory id")
  .action(async (id) => {
    await promoteMemory(id);
    console.log(`promoted ${id}`);
  });

program
  .command("reject")
  .argument("<id>", "memory id")
  .action(async (id) => {
    await rejectMemory(id);
    console.log(`rejected ${id}`);
  });

program
  .command("compact")
  .action(async () => {
    const result = await compressMemories();
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("forget")
  .action(async () => {
    const archived = await forgetWeakMemories();
    console.log(JSON.stringify({ archived }, null, 2));
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