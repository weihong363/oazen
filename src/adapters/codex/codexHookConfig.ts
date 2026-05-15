import { promises as fs } from "fs";
import path from "path";

export type CodexHookScope = "project" | "user";

type HooksJson = {
  hooks?: Record<string, unknown[]>;
};

const MANAGED_EVENTS = ["SessionStart", "UserPromptSubmit", "Stop"] as const;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function getCliCommand(): string {
  const entryPoint = process.argv[1] ? path.resolve(process.argv[1]) : path.resolve("dist", "index.js");
  return `${shellQuote(process.execPath)} ${shellQuote(entryPoint)}`;
}

function hookCommand(cwd: string, scope: CodexHookScope, eventName: string): string {
  const baseCommand = `${getCliCommand()} hook codex ${eventName}`;
  if (scope === "user") return baseCommand;

  return `OAZEN_HOME=${shellQuote(path.join(path.resolve(cwd), ".oazen"))} ${baseCommand}`;
}

function hookEntry(command: string, timeout: number, statusMessage: string): Record<string, unknown> {
  return {
    hooks: [
      {
        type: "command",
        command,
        timeout,
        statusMessage,
      },
    ],
  };
}

export function buildCodexHooksConfig(cwd = process.cwd(), scope: CodexHookScope = "user"): HooksJson {
  return {
    hooks: {
      SessionStart: [
        {
          matcher: "startup|resume|clear",
          ...hookEntry(hookCommand(cwd, scope, "session-start"), 10, "Loading Oazen project memory"),
        },
      ],
      UserPromptSubmit: [
        hookEntry(hookCommand(cwd, scope, "user-prompt-submit"), 10, "Retrieving Oazen context"),
      ],
      Stop: [hookEntry(hookCommand(cwd, scope, "stop"), 30, "Updating Oazen memory")],
    },
  };
}

function configPath(cwd: string, scope: CodexHookScope): string {
  if (scope === "user") {
    return path.join(process.env.HOME ?? process.cwd(), ".codex", "hooks.json");
  }

  return path.join(path.resolve(cwd), ".codex", "hooks.json");
}

async function readExisting(filePath: string): Promise<HooksJson> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as HooksJson;
  } catch (error: any) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export async function installCodexHooks(
  cwd: string,
  scope: CodexHookScope
): Promise<{ path: string; backedUp: boolean }> {
  const filePath = configPath(cwd, scope);
  const existing = await readExisting(filePath);
  const generated = buildCodexHooksConfig(cwd, scope);
  const merged: HooksJson = {
    ...existing,
    hooks: {
      ...(existing.hooks ?? {}),
      ...(generated.hooks ?? {}),
    },
  };
  let backedUp = false;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
    await fs.copyFile(filePath, `${filePath}.bak`);
    backedUp = true;
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }

  await fs.writeFile(filePath, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
  return { path: filePath, backedUp };
}

export async function uninstallCodexHooks(
  cwd: string,
  scope: CodexHookScope
): Promise<{ path: string; removedEvents: string[] }> {
  const filePath = configPath(cwd, scope);
  const existing = await readExisting(filePath);
  const hooks = { ...(existing.hooks ?? {}) };
  const removedEvents = MANAGED_EVENTS.filter((eventName) => eventName in hooks);

  for (const eventName of MANAGED_EVENTS) {
    delete hooks[eventName];
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ ...existing, hooks }, null, 2)}\n`, "utf-8");
  return { path: filePath, removedEvents };
}
