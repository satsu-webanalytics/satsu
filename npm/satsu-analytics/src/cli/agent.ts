import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { projectRoot } from "./detect";

export type Editor = "claude" | "cursor" | "vscode" | "windsurf";

export const EDITORS: Array<{ id: Editor; label: string }> = [
  { id: "claude", label: "Claude Code" },
  { id: "cursor", label: "Cursor" },
  { id: "vscode", label: "VS Code" },
  { id: "windsurf", label: "Windsurf" },
];

const SERVER_NAME = "satsu";

/** The server reads its key from the user config written by login, so nothing secret lands in a project file. */
const COMMAND = { command: "npx", args: ["-y", "satsu-analytics", "mcp"] };

interface Target {
  /** Relative to the project, or to the home directory when `home` is set. */
  path: string;
  home: boolean;
  /** Top-level key holding the server map. */
  key: "mcpServers" | "servers";
  entry: Record<string, unknown>;
}

function target(editor: Editor): Target {
  switch (editor) {
    case "claude":
      return { path: ".mcp.json", home: false, key: "mcpServers", entry: { type: "stdio", ...COMMAND } };
    case "cursor":
      return { path: ".cursor/mcp.json", home: false, key: "mcpServers", entry: COMMAND };
    case "vscode":
      return { path: ".vscode/mcp.json", home: false, key: "servers", entry: { type: "stdio", ...COMMAND } };
    case "windsurf":
      return { path: ".codeium/windsurf/mcp_config.json", home: true, key: "mcpServers", entry: COMMAND };
  }
}

/** Config to paste into editors without a writer. */
export function printedConfig(): string {
  return JSON.stringify({ mcpServers: { [SERVER_NAME]: COMMAND } }, null, 2);
}

/** Detects editors from their config folders in the project (Windsurf: in the home directory). */
export function detectEditors(start: string, home = homedir()): Editor[] {
  const cwd = projectRoot(start);
  const found: Editor[] = [];
  if (existsSync(join(cwd, ".mcp.json")) || existsSync(join(cwd, ".claude")) || existsSync(join(cwd, "CLAUDE.md"))) {
    found.push("claude");
  }
  if (existsSync(join(cwd, ".cursor"))) found.push("cursor");
  if (existsSync(join(cwd, ".vscode"))) found.push("vscode");
  if (existsSync(join(home, ".codeium", "windsurf"))) found.push("windsurf");
  return found;
}

export type McpMergeResult = { ok: true; content: string; changed: boolean } | { ok: false; reason: string };

/** Adds the Satsu server to an existing config text, leaving every other entry untouched. */
export function mergeMcpConfig(existing: string | null, editor: Editor): McpMergeResult {
  const t = target(editor);
  let root: Record<string, any> = {};
  if (existing !== null && existing.trim() !== "") {
    try {
      root = JSON.parse(existing);
    } catch {
      return { ok: false, reason: "the file isn't valid JSON" };
    }
    if (root === null || typeof root !== "object" || Array.isArray(root)) {
      return { ok: false, reason: "the file isn't a JSON object" };
    }
  }
  const servers = root[t.key];
  if (servers !== undefined && (servers === null || typeof servers !== "object" || Array.isArray(servers))) {
    return { ok: false, reason: `"${t.key}" isn't an object` };
  }
  const changed = JSON.stringify(servers?.[SERVER_NAME]) !== JSON.stringify(t.entry);
  const next = { ...root, [t.key]: { ...(servers ?? {}), [SERVER_NAME]: t.entry } };
  return { ok: true, changed, content: JSON.stringify(next, null, 2) + "\n" };
}

/** Writes (merging) the config for one editor; returns the file path or why it was left alone. */
export async function writeMcpConfig(
  editor: Editor,
  cwd: string,
  home = homedir(),
): Promise<{ ok: true; path: string; changed: boolean } | { ok: false; reason: string }> {
  const t = target(editor);
  const abs = join(t.home ? home : projectRoot(cwd), t.path);
  let existing: string | null = null;
  try {
    existing = await readFile(abs, "utf8");
  } catch {
    // Missing file: created below.
  }
  const merged = mergeMcpConfig(existing, editor);
  if (!merged.ok) return merged;
  const changed = merged.changed || existing === null;
  if (changed) {
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, merged.content);
  }
  return { ok: true, path: abs, changed };
}
