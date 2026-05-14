import { installCodexHooks, uninstallCodexHooks, CodexHookScope } from "../adapters/codex/codexHookConfig";

export function parseInstallScope(value: string): CodexHookScope {
  if (value !== "project" && value !== "user") {
    throw new Error(`Unsupported install scope: ${value}`);
  }

  return value;
}

export async function installCodex(scope: CodexHookScope, cwd = process.cwd()): Promise<Record<string, unknown>> {
  const result = await installCodexHooks(cwd, scope);

  return {
    version: "1",
    kind: "install_result",
    adapter: "codex",
    scope,
    ...result,
    configToml: "Enable Codex hooks in ~/.codex/config.toml if your Codex build requires an explicit hooks flag.",
  };
}

export async function uninstallCodex(scope: CodexHookScope, cwd = process.cwd()): Promise<Record<string, unknown>> {
  const result = await uninstallCodexHooks(cwd, scope);

  return {
    version: "1",
    kind: "uninstall_result",
    adapter: "codex",
    scope,
    ...result,
  };
}
