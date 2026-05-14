import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { RecallResult } from "../core/types";

export function formatCodexContextPacket(result: RecallResult): string {
  const lines = [
    "<OAZEN_CONTEXT_PACKET version=\"1\">",
    `task: ${result.task}`,
    `cwd: ${result.scope.cwd}`,
    `inferred_scope: ${result.scope.inferredWriteScope}`,
    `repo: ${result.scope.repoPath ?? "none"}`,
    `project: ${result.scope.projectPath ?? "none"}`,
    `retrieved_candidates: ${result.counts.retrieved}`,
    `selected_memories: ${result.counts.selected}`,
    `selected_tokens: ${result.tokenEstimate.selected}`,
    `saved_vs_baseline: ${result.tokenEstimate.savedVsBaseline}`,
    "",
    "relevant_memories:",
  ];

  if (result.selected.length === 0) {
    lines.push("- none");
  }

  for (const memory of result.selected) {
    lines.push(
      `- [${memory.scope}/${memory.layer}/${memory.kind}] score=${memory.score.toFixed(2)} ${memory.content}`
    );
  }

  lines.push("</OAZEN_CONTEXT_PACKET>");
  return lines.join("\n");
}

export type CodexTemplateValues = {
  task: string;
  cwd: string;
  packet: string;
  packetFile: string;
  sessionFile?: string;
};

export function applyCodexTemplate(input: string, values: CodexTemplateValues): string {
  const replacements: Array<[string, string | undefined]> = [
    ["{task}", values.task],
    ["{cwd}", values.cwd],
    ["{packet}", values.packet],
    ["{packetFile}", values.packetFile],
    ["{sessionFile}", values.sessionFile],
  ];

  return replacements.reduce(
    (result, [token, value]) => result.split(token).join(value ?? ""),
    input
  );
}

export function applyCodexTemplateToArgs(
  args: string[],
  values: CodexTemplateValues
): string[] {
  return args.map((arg) => applyCodexTemplate(arg, values));
}

export async function writeCodexContextPacket(
  packet: string,
  filePath?: string
): Promise<string> {
  const targetPath =
    filePath ??
    path.join(os.tmpdir(), `oazen-codex-context-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, packet, "utf-8");
  return path.resolve(targetPath);
}
