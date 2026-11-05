import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { credentialsPath, saveCredentials } from "../src/cli/auth";
import { mergeMcpConfig, writeMcpConfig } from "../src/cli/agent";
import { eventNames, renderTypes, types } from "../src/cli/types";

describe("mergeMcpConfig", () => {
  it("creates the config when none exists", () => {
    const r = mergeMcpConfig(null, "cursor");
    expect(r.ok && JSON.parse(r.content)).toEqual({
      mcpServers: { satsu: { command: "npx", args: ["-y", "satsu-analytics", "mcp"] } },
    });
  });

  it("keeps other servers and top-level keys, and uses `servers` for VS Code", () => {
    const r = mergeMcpConfig(JSON.stringify({ inputs: [], servers: { a: { command: "a" } } }), "vscode");
    const cfg = r.ok && JSON.parse(r.content);
    expect(cfg.inputs).toEqual([]);
    expect(Object.keys(cfg.servers)).toEqual(["a", "satsu"]);
  });

  it("is idempotent", () => {
    const first = mergeMcpConfig(null, "claude");
    if (!first.ok) throw new Error("unreachable");
    const second = mergeMcpConfig(first.content, "claude");
    expect(second.ok && second.changed).toBe(false);
  });

  it("refuses files it can't merge", () => {
    expect(mergeMcpConfig("{ nope", "claude").ok).toBe(false);
    expect(mergeMcpConfig("[]", "claude").ok).toBe(false);
    expect(mergeMcpConfig('{"mcpServers": []}', "claude").ok).toBe(false);
  });
});

describe("writeMcpConfig", () => {
  it("puts Windsurf in the home directory and leaves invalid files untouched", async () => {
    const home = mkdtempSync(join(tmpdir(), "satsu-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "satsu-cwd-"));
    const r = await writeMcpConfig("windsurf", cwd, home);
    expect(r.ok && r.path).toBe(join(home, ".codeium/windsurf/mcp_config.json"));
    mkdirSync(join(cwd, ".vscode"));
    writeFileSync(join(cwd, ".vscode/mcp.json"), "// comment\n{}");
    expect((await writeMcpConfig("vscode", cwd, home)).ok).toBe(false);
    expect(readFileSync(join(cwd, ".vscode/mcp.json"), "utf8")).toBe("// comment\n{}");
  });
});

describe("types", () => {
  it("takes only custom-event goals, deduplicated and sorted", () => {
    const goals = { goals: [
      { type: "custom_event", matcher: "signup" },
      { type: "path", matcher: "/pricing" },
      { type: "custom_event", matcher: "newsletter-join" },
      { type: "custom_event", matcher: "signup" },
    ] };
    expect(eventNames(goals)).toEqual(["newsletter-join", "signup"]);
    expect(eventNames([{ type: "custom_event", matcher: "a" }])).toEqual(["a"]);
    expect(eventNames(null)).toEqual([]);
  });

  it("renders a declaration-merging file with quoted odd names", () => {
    const out = renderTypes(["newsletter-join", "signup"]);
    expect(out).toContain('declare module "satsu-analytics"');
    expect(out).toContain('"newsletter-join": Record<string, string | number | boolean> | undefined;');
    expect(out).toContain("signup: Record<string, string | number | boolean> | undefined;");
  });
});

describe("types command", () => {
  it("writes satsu-events.d.ts from the site's goals", async () => {
    const urls: string[] = [];
    const server = createServer((req, res) => {
      urls.push(`${req.url} ${req.headers.authorization}`);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ goals: [{ type: "custom_event", matcher: "signup" }, { type: "path", matcher: "/x" }] }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const env = { XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), "satsu-cfg-")) };
    const apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await saveCredentials(credentialsPath(env), { apiUrl, key: "satsu_live_k", orgId: "o" });
    const cwd = mkdtempSync(join(tmpdir(), "satsu-types-"));
    expect(await types(["--site", "site_1"], cwd, env)).toBe(true);
    server.close();
    expect(urls).toEqual(["/v1/sites/site_1/goals Bearer satsu_live_k"]);
    expect(readFileSync(join(cwd, "satsu-events.d.ts"), "utf8")).toContain("signup:");
  });
});
