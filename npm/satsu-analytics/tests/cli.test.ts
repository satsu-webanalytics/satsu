import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { login, logout, type Deps } from "../src/cli/commands";
import { credentialsPath } from "../src/cli/auth";

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), error: vi.fn() },
  spinner: () => ({ start: vi.fn(), stop: vi.fn(), error: vi.fn() }),
}));

let server: Server;
let base: string;
let expiresIn = 600;
let pollReplies: Array<Record<string, unknown> | number>;
let seenHeaders: Array<string | undefined>;
let opened: string[];
let deps: Deps;
let configDir: string;

beforeEach(async () => {
  pollReplies = [];
  expiresIn = 600;
  seenHeaders = [];
  opened = [];
  server = createServer((req, res) => {
    seenHeaders.push(req.headers["x-satsu-client"] as string | undefined);
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/cli/auth/start") {
      res.end(
        JSON.stringify({
          device_code: "dev",
          user_code: "ABCD-1234",
          verification_url: "https://satsu.pro/cli/authorize?code=ABCD-1234",
          interval: 2,
          expires_in: expiresIn,
        }),
      );
    } else if (req.url === "/v1/cli/auth/poll") {
      const next = pollReplies.shift() ?? { status: "pending" };
      if (typeof next === "number") {
        res.statusCode = next;
        res.end("{}");
      } else res.end(JSON.stringify(next));
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  configDir = await mkdtemp(join(tmpdir(), "satsu-cli-"));
  let t = 0;
  deps = {
    env: { SATSU_API_URL: `${base}/`, XDG_CONFIG_HOME: configDir },
    open: (u) => opened.push(u),
    sleep: async (ms) => {
      t += ms;
    },
    now: () => t,
  };
});

afterEach(() => new Promise<void>((r) => server.close(() => r())));

describe("credentialsPath", () => {
  it("uses APPDATA on Windows and XDG/.config elsewhere", () => {
    expect(credentialsPath({ APPDATA: "C:\\A" }, "win32")).toContain("satsu-analytics");
    expect(credentialsPath({ APPDATA: "C:\\A" }, "win32")).toContain("C:\\A");
    expect(credentialsPath({ XDG_CONFIG_HOME: "/x" }, "linux")).toBe(
      join("/x", "satsu-analytics", "credentials.json"),
    );
  });
});

describe("login", () => {
  it("polls until approved, stores credentials 0600, opens the browser", async () => {
    pollReplies = [{ status: "pending" }, { key: "satsu_live_abc", org: { id: "org_1" }, user: { id: "u" } }];
    expect(await login(deps)).toBe(true);
    const path = credentialsPath(deps.env);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      apiUrl: base,
      key: "satsu_live_abc",
      orgId: "org_1",
    });
    if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(opened).toEqual(["https://satsu.pro/cli/authorize?code=ABCD-1234"]);
    expect(seenHeaders.every((h) => h?.startsWith("cli/"))).toBe(true);
  });

  it("stores nothing when denied", async () => {
    pollReplies = [{ status: "denied" }];
    expect(await login(deps)).toBe(false);
    await expect(stat(credentialsPath(deps.env))).rejects.toThrow();
  });

  it("gives up when the code expires", async () => {
    pollReplies = [{ status: "expired" }];
    expect(await login(deps)).toBe(false);
    await expect(stat(credentialsPath(deps.env))).rejects.toThrow();
  });

  it("reports an already used sign-in", async () => {
    pollReplies = [{ status: "consumed" }];
    expect(await login(deps)).toBe(false);
    await expect(stat(credentialsPath(deps.env))).rejects.toThrow();
  });

  it("times out locally after expires_in", async () => {
    expiresIn = 6;
    expect(await login(deps)).toBe(false);
  });

  it("reports server errors and unreachable API without throwing", async () => {
    pollReplies = [500];
    expect(await login(deps)).toBe(false);
    expect(await login({ ...deps, env: { ...deps.env, SATSU_API_URL: "http://127.0.0.1:1" } })).toBe(false);
  });
});

describe("logout", () => {
  it("removes the credentials file", async () => {
    pollReplies = [{ key: "k", org: "org_1" }];
    await login(deps);
    expect(await logout(deps)).toBe(true);
    await expect(stat(credentialsPath(deps.env))).rejects.toThrow();
    expect(await logout(deps)).toBe(false);
  });
});
