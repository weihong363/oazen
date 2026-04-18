import crypto from "crypto";
import { promises as fs } from "fs";
import { buildCreationChange, buildMemoryChange, buildMutationResult } from "./contracts";
import { loadMemories, saveMemories } from "./memory-store";
import { upsertMemory } from "./merge";
import { inferScopeContext, resolveWriteScope } from "./scope";
import { screenMemoryText } from "./safety";
import { Memory, MemoryKind, MemoryMutationResult, MemoryScope } from "./types";

function detectKind(sentence: string): MemoryKind | null {
  const s = sentence.toLowerCase();

  if (s.includes("avoid") || s.includes("do not") || s.includes("don't")) return "warning";
  if (s.includes("prefer") || s.includes("always")) return "preference";
  if (s.includes("fixed by") || s.includes("run ") || s.includes("steps")) return "workflow";
  if (s.includes("root cause") || s.includes("uses ") || s.includes("is ")) return "fact";
  if (s.includes("decided") || s.includes("we chose")) return "decision";

  return null;
}

function initialLayer(kind: MemoryKind): Memory["layer"] {
  return "inbox";
}

function buildMemory(
  sentence: string,
  kind: MemoryKind,
  cwd: string,
  requestedScope: MemoryScope | "auto"
): Memory | null {
  const now = Date.now();
  const context = inferScopeContext(cwd);
  const scopeRef = resolveWriteScope(context, requestedScope);
  const screening = screenMemoryText(sentence);

  if (screening.level === "blocked") return null;

  return {
    id: crypto.randomUUID(),
    layer: initialLayer(kind),
    kind,
    scope: scopeRef.scope,
    scopeKey: scopeRef.scopeKey,
    scopePath: scopeRef.scopePath,
    title: screening.redactedTitle,
    content: screening.redactedContent.trim(),
    tags: [],
    source: "derived",
    evidence: screening.redactedContent.trim(),
    strength: 0.55,
    accessCount: 0,
    lastAccessedAt: now,
    createdAt: now,
    updatedAt: now,
    stability: kind === "state" ? "volatile" : "stable",
    status: "active",
    reviewState: "pending",
    sensitivity: screening.level,
    sensitivityReasons: screening.reasons,
    restrictedToInbox: screening.restrictedToInbox,
  };
}

export async function writebackFromFile(
  filePath: string,
  options: { cwd?: string; scope?: MemoryScope | "auto" } = {}
): Promise<MemoryMutationResult> {
  const raw = await fs.readFile(filePath, "utf-8");
  const cwd = options.cwd ?? process.cwd();
  const scope = options.scope ?? "auto";
  const context = inferScopeContext(cwd);

  const sentences = raw
    .split(/\n|[.!?]/)
    .map((sentence: string) => sentence.trim())
    .filter((sentence: string) => sentence.length >= 18);

  const blocked = [];
  const extracted: Memory[] = [];

  for (const sentence of sentences) {
    const screening = screenMemoryText(sentence);
    if (screening.level === "blocked") {
      blocked.push({ content: screening.redactedContent, reasons: screening.reasons });
      continue;
    }

    const kind = detectKind(sentence);
    if (!kind) continue;

    const memory = buildMemory(sentence, kind, cwd, scope);
    if (memory) extracted.push(memory);
  }

  let current = await loadMemories();
  const changes = [];

  for (const item of extracted) {
    const result = upsertMemory(current, item);
    current = result.memories;
    changes.push(
      result.change.before
        ? buildMemoryChange(result.change.before, result.change.after)
        : buildCreationChange(result.change.after)
    );
  }

  await saveMemories(current);
  const scopeRef = resolveWriteScope(context, scope);

  return buildMutationResult(
    "writeback",
    changes,
    {
      scope: {
        cwd: context.cwd,
        inferredWriteScope: scopeRef.scope,
        inferredScopeKey: scopeRef.scopeKey,
      },
      blocked,
    }
  );
}
