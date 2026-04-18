import { ContextPacket } from "./types";

export function formatCodexContextPacket(packet: ContextPacket): string {
  const lines = [
    "<OAZEN_CONTEXT_PACKET version=\"1\">",
    `task: ${packet.task}`,
    `cwd: ${packet.scope.cwd}`,
    `inferred_scope: ${packet.scope.inferredWriteScope}`,
    `repo: ${packet.scope.repoPath ?? "none"}`,
    `project: ${packet.scope.projectPath ?? "none"}`,
    "",
    "relevant_memories:",
  ];

  if (packet.memories.length === 0) {
    lines.push("- none");
  }

  for (const memory of packet.memories) {
    lines.push(
      `- [${memory.scope}/${memory.layer}/${memory.kind}] score=${memory.score.toFixed(2)} ${memory.content}`
    );
  }

  lines.push("</OAZEN_CONTEXT_PACKET>");
  return lines.join("\n");
}
