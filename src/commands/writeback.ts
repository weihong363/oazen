import crypto from "crypto";
import { promises as fs } from "fs";
import { buildCreationChange, buildMemoryChange, buildMutationResult } from "../core/contracts";
import { screenMemoryText } from "../core/safety";
import { inferScopeContext, resolveWriteScope } from "../core/scope";
import { Memory, MemoryKind, MemoryMutationResult, MemoryScope } from "../core/types";
import { withLockedMemories } from "../storage/memory-store";
import { upsertMemory } from "./merge";

const STRUCTURAL_LABELS = new Set([
  "preference signals",
  "reusable knowledge",
  "failures and how to do differently",
  "references",
  "description",
  "keywords",
]);

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

function splitIntoCandidateSentences(raw: string): string[] {
  return raw
    .split(/\n+/)
    .flatMap((line) =>
      line
        .split(/(?<=[.!?])\s+(?=[A-Z0-9"`\-\u4e00-\u9fff])/)
        .map((sentence) => sentence.trim())
    )
    .filter((sentence) => sentence.length >= 18);
}

function stripListMarker(sentence: string): string {
  return sentence.replace(/^[-*]\s+/, "").trim();
}

function isStructuralMarkdownNoise(sentence: string): boolean {
  const trimmed = sentence.trim();
  const normalized = stripListMarker(trimmed)
    .replace(/^#{1,6}\s+/, "")
    .replace(/:+$/, "")
    .trim()
    .toLowerCase();

  if (!normalized) return true;
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (/^---+$/.test(trimmed)) return true;
  if (STRUCTURAL_LABELS.has(normalized)) return true;
  if (/^(task|task_group|task_outcome|cwd|updated_at|rollout_path|rollout_summary_file):/i.test(trimmed)) {
    return true;
  }
  if (/^##?\s+/.test(trimmed)) return true;

  return false;
}

function isCodeLikeFragment(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (!/[a-z]/i.test(trimmed)) return true;
  if (/^[`"'()[\]{}:;/\\._\-\s]+$/.test(trimmed)) return true;
  if (
    /^[a-z0-9_/-]+\.[a-z0-9_-]+`?\s+is\s+/i.test(trimmed) &&
    !/\b(verification gate|passed after|used as|real gates?)\b/i.test(trimmed)
  ) {
    return true;
  }
  if (
    (trimmed.match(/`/g) ?? []).length >= 4 &&
    !/\b(root cause|prefer|always|avoid|decided|we chose|fixed by|run |steps|verification gate|passed after|used as|real gates?)\b/i.test(trimmed)
  ) {
    return true;
  }

  return false;
}

function shouldSkipSentence(sentence: string): boolean {
  if (isStructuralMarkdownNoise(sentence)) return true;
  if (isCodeLikeFragment(sentence)) return true;
  return false;
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

  const sentences = splitIntoCandidateSentences(raw);

  const blocked = [];
  const extracted: Memory[] = [];

  for (const sentence of sentences) {
    if (shouldSkipSentence(sentence)) continue;

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

  const changes = await withLockedMemories(async (memories) => {
    const nextChanges = [];

    for (const item of extracted) {
      const result = upsertMemory(memories, item);
      memories.splice(0, memories.length, ...result.memories);
      nextChanges.push(
        result.change.before
          ? buildMemoryChange(result.change.before, result.change.after)
          : buildCreationChange(result.change.after)
      );
    }

    return nextChanges;
  });

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
