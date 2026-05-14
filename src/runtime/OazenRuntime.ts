import { extractMemoryRecords, summarizeStopInput } from "../memory/MemoryCompactor";
import { MemoryRetriever, RetrievedMemory } from "../memory/MemoryRetriever";
import { MemoryStore } from "../memory/MemoryStore";
import { ProjectResolver } from "../project/ProjectResolver";
import { logOazenEvent } from "../utils/logger";
import { NormalizedHookEvent } from "./HookEvent";
import { HookResult } from "./HookResult";

const SESSION_CONTEXT_BUDGET = 7200;
const PROMPT_CONTEXT_BUDGET = 4800;

type RuntimeOptions = {
  projectResolver?: ProjectResolver;
  memoryStore?: MemoryStore;
  memoryRetriever?: MemoryRetriever;
};

function formatMemoryLine(record: RetrievedMemory): string {
  return `- ${record.content}`;
}

function section(title: string, lines: string[]): string[] {
  return [title, ...(lines.length > 0 ? lines : ["- none"])];
}

function memoriesByType(memories: RetrievedMemory[], type: RetrievedMemory["type"]): string[] {
  return memories.filter((memory) => memory.type === type).map(formatMemoryLine);
}

function formatProjectContext(
  projectName: string,
  branch: string | undefined,
  memories: RetrievedMemory[]
): string {
  const lines = [
    "OAZEN PROJECT CONTEXT",
    `- Project: ${projectName}`,
    `- Current branch: ${branch ?? "unknown"}`,
    ...section("Stable rules:", memoriesByType(memories, "project_rule")),
    ...section("Relevant decisions:", memoriesByType(memories, "decision")),
    ...section("Recent task state:", memoriesByType(memories, "task_summary")),
    ...section("Known constraints:", [
      ...memoriesByType(memories, "known_issue"),
      ...memoriesByType(memories, "todo"),
    ]),
    ...section("Suggested validation:", ["- Run the focused tests or build command that covers the touched code."]),
  ];

  return lines.join("\n");
}

function hookResult(additionalContext?: string, metadata: Record<string, unknown> = {}): HookResult {
  return {
    continue: true,
    decision: "none",
    additionalContext,
    metadata,
  };
}

export class OazenRuntime {
  private readonly projectResolver: ProjectResolver;
  private readonly memoryStore: MemoryStore;
  private readonly memoryRetriever: MemoryRetriever;

  constructor(options: RuntimeOptions = {}) {
    this.projectResolver = options.projectResolver ?? new ProjectResolver();
    this.memoryStore = options.memoryStore ?? new MemoryStore();
    this.memoryRetriever = options.memoryRetriever ?? new MemoryRetriever(this.memoryStore);
  }

  async handleSessionStart(event: NormalizedHookEvent): Promise<HookResult> {
    return this.withFailOpen(event, async () => {
      const project = this.projectResolver.resolve(event.cwd);
      const memories = await this.memoryRetriever.retrieve(
        project.projectId,
        "project_summary project_rule decision task_summary known_issue todo user_preference",
        SESSION_CONTEXT_BUDGET
      );
      await this.memoryStore.touch(memories.map((memory) => memory.id));
      const additionalContext = memories.length > 0
        ? formatProjectContext(project.workspaceName, project.currentBranch, memories)
        : undefined;

      await this.logSuccess(event, project.projectId, memories.length, 0, Boolean(additionalContext));
      return hookResult(additionalContext, { projectId: project.projectId, retrieved: memories.length });
    });
  }

  async handleUserPrompt(event: NormalizedHookEvent): Promise<HookResult> {
    return this.withFailOpen(event, async () => {
      const project = this.projectResolver.resolve(event.cwd);
      const query = event.userPrompt?.trim() || "current user prompt";
      const memories = await this.memoryRetriever.retrieve(project.projectId, query, PROMPT_CONTEXT_BUDGET);
      await this.memoryStore.touch(memories.map((memory) => memory.id));
      const additionalContext = memories.length > 0
        ? formatProjectContext(project.workspaceName, project.currentBranch, memories)
        : undefined;

      await this.logSuccess(event, project.projectId, memories.length, 0, Boolean(additionalContext));
      return hookResult(additionalContext, { projectId: project.projectId, retrieved: memories.length });
    });
  }

  async handleStop(event: NormalizedHookEvent): Promise<HookResult> {
    return this.withFailOpen(event, async () => {
      const project = this.projectResolver.resolve(event.cwd);
      const sourceText = event.transcript ?? JSON.stringify(event.raw);
      const records = extractMemoryRecords(summarizeStopInput(sourceText), project, "stop");
      let written = 0;

      for (const record of records) {
        const result = await this.memoryStore.upsert(record);
        if (result.created) written += 1;
      }

      await this.logSuccess(event, project.projectId, 0, written, false);
      return hookResult(undefined, { projectId: project.projectId, written });
    });
  }

  async handlePreToolUse(event: NormalizedHookEvent): Promise<HookResult> {
    return this.withFailOpen(event, async () => hookResult(undefined, { observed: event.toolName ?? "unknown" }));
  }

  async handlePostToolUse(event: NormalizedHookEvent): Promise<HookResult> {
    return this.withFailOpen(event, async () => hookResult(undefined, { observed: event.toolName ?? "unknown" }));
  }

  async handlePermissionRequest(event: NormalizedHookEvent): Promise<HookResult> {
    return this.withFailOpen(event, async () => hookResult(undefined, { reason: event.reason ?? "none" }));
  }

  private async withFailOpen(
    event: NormalizedHookEvent,
    work: () => Promise<HookResult>
  ): Promise<HookResult> {
    const startedAt = Date.now();

    try {
      const result = await work();
      return {
        ...result,
        metadata: {
          ...result.metadata,
          durationMs: Date.now() - startedAt,
        },
      };
    } catch (error) {
      await logOazenEvent({
        event: event.name,
        adapter: event.adapter,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        failOpen: true,
      }).catch(() => undefined);

      return hookResult(undefined, {
        failOpen: true,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async logSuccess(
    event: NormalizedHookEvent,
    projectId: string,
    retrieved: number,
    written: number,
    injected: boolean
  ): Promise<void> {
    await logOazenEvent({
      event: event.name,
      adapter: event.adapter,
      projectId,
      retrieved,
      written,
      injected,
    }).catch(() => undefined);
  }
}
