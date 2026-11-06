import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectEditors, writeMcpConfig } from "../src/cli/agent";
import { detectPackageManager, projectRoot } from "../src/cli/detect";

function pnpmMonorepo(): { root: string; app: string } {
  const root = mkdtempSync(join(tmpdir(), "satsu-mono-"));
  mkdirSync(join(root, ".git"));
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
  writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "mono", private: true }));
  writeFileSync(join(root, "CLAUDE.md"), "# repo\n");
  const app = join(root, "apps", "web");
  mkdirSync(app, { recursive: true });
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "@mono/web", dependencies: { next: "15.0.0" } }));
  return { root, app };
}

describe("monorepo root", () => {
  it("finds the workspace root, its lockfile and its editor config from an app package", async () => {
    const { root, app } = pnpmMonorepo();
    expect(projectRoot(app)).toBe(root);
    expect(detectPackageManager(app)).toBe("pnpm");
    expect(detectEditors(app, mkdtempSync(join(tmpdir(), "home-")))).toContain("claude");

    const r = await writeMcpConfig("claude", app);
    expect(r.ok && r.path).toBe(join(root, ".mcp.json"));
    expect(existsSync(join(app, ".mcp.json"))).toBe(false);
  });

  it("uses a nearer lockfile inside the app over the root one", () => {
    const { app } = pnpmMonorepo();
    writeFileSync(join(app, "yarn.lock"), "");
    expect(detectPackageManager(app)).toBe("yarn");
  });

  it("treats a package.json `workspaces` field as the root", () => {
    const root = mkdtempSync(join(tmpdir(), "satsu-ws-"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ private: true, workspaces: ["apps/*"] }));
    writeFileSync(join(root, "package-lock.json"), "{}");
    const app = join(root, "apps", "site");
    mkdirSync(app, { recursive: true });
    expect(projectRoot(app)).toBe(root);
    expect(detectPackageManager(app)).toBe("npm");
  });

  it("keeps a single-package project in its own directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "satsu-single-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "site" }));
    writeFileSync(join(dir, "bun.lock"), "");
    expect(projectRoot(dir)).toBe(dir);
    expect(detectPackageManager(dir)).toBe("bun");
  });
});
