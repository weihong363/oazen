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
