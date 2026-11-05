import { createServer as createHttp, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/mcp/server";

const PRO_ONLY = [/\/goals\/[^/]+\/conversions$/, /\/live$/, /\/monitors$/, /\/audits$/, /\/breakdown\/channels$/, /\/run$/];

let api: Server;
let base: string;
let plan: "free" | "pro";
let seen: Array<{ method: string; url: string; client?: string; auth?: string; body: string }>;
let status: number | null;
let client: Client;

async function connect(creds: boolean) {
  const server = createServer({
    loadCredentials: async () => (creds ? { apiUrl: base, key: "satsu_live_test", orgId: "o1" } : null),
    fetch,
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: "test", version: "0" });
  await client.connect(b);
}

async function run(name: string, args: Record<string, unknown> = {}) {
  const r = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: Array<{ text: string }>;
  };
  return { error: !!r.isError, text: r.content[0].text };
}

beforeEach(async () => {
  plan = "pro";
  status = null;
  seen = [];
  api = createHttp((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({
        method: req.method!,
        url: req.url!,
        client: req.headers["x-satsu-client"] as string,
        auth: req.headers.authorization,
        body,
      });
      res.setHeader("content-type", "application/json");
      const path = req.url!.split("?")[0];
      if (status) {
        res.statusCode = status;
        res.end(JSON.stringify(status === 402 ? { error: "plan_required", upgrade_url: "https://satsu.pro/pricing" } : { error: "x" }));
      } else if (plan === "free" && PRO_ONLY.some((re) => re.test(path))) {
        res.statusCode = 402;
        res.end(JSON.stringify({ error: "plan_required", plan: "pro", upgrade_url: "https://satsu.pro/upgrade?from=mcp" }));
      } else {
        res.end(JSON.stringify({ ok: true, path }));
      }
    });
  });
  await new Promise<void>((r) => api.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  await connect(true);
});

afterEach(async () => {
  await client.close();
  await new Promise((r) => api.close(r));
});

describe("tools", () => {
  it("lists the 17 tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "list_sites", "traffic_summary", "top_pages", "top_sources", "ai_traffic", "breakdown", "goals",
        "goal_conversions", "live_visitors", "uptime_status", "audit_results", "create_site", "set_site_domain",
        "create_goal", "update_goal", "start_audit", "create_monitor",
      ].sort(),
    );
  });

  it("never promises per-visitor data", async () => {
    const { tools } = await client.listTools();
    for (const t of tools) expect(t.description ?? "").not.toMatch(/per[- ]visitor|individual visitor data|session id|raw event/i);
  });

  it("maps each tool to one public-api call with the mcp client header", async () => {
    const cases: Array<[string, Record<string, unknown>, string, string]> = [
      ["list_sites", {}, "GET", "/v1/sites"],
      ["traffic_summary", { site: "s1", from: "2026-01-01" }, "GET", "/v1/sites/s1/overview?from=2026-01-01"],
      ["top_pages", { site: "s1" }, "GET", "/v1/sites/s1/breakdown/pages"],
      ["top_sources", { site: "s1" }, "GET", "/v1/sites/s1/breakdown/referrers"],
      ["ai_traffic", { site: "s1" }, "GET", "/v1/sites/s1/breakdown/channels"],
      ["breakdown", { site: "s1", dimension: "countries" }, "GET", "/v1/sites/s1/breakdown/countries"],
      ["goals", { site: "s1" }, "GET", "/v1/sites/s1/goals"],
      ["goal_conversions", { site: "s1", goal: "g1" }, "GET", "/v1/sites/s1/goals/g1/conversions"],
      ["live_visitors", { site: "s1" }, "GET", "/v1/sites/s1/live"],
      ["uptime_status", { site: "s1" }, "GET", "/v1/sites/s1/monitors"],
      ["audit_results", { site: "s1" }, "GET", "/v1/sites/s1/audits"],
      ["create_site", { workspace: "w1", name: "Blog" }, "POST", "/v1/sites"],
      ["set_site_domain", { site: "s1", domain: "example.com" }, "PATCH", "/v1/sites/s1"],
      ["create_goal", { site: "s1", name: "Signup", type: "custom_event", matcher: "signup" }, "POST", "/v1/sites/s1/goals"],
      ["update_goal", { site: "s1", goal: "g1", name: "Sign up" }, "PATCH", "/v1/sites/s1/goals/g1"],
      ["start_audit", { site: "s1", pillar: "seo" }, "POST", "/v1/sites/s1/audits/seo/run"],
      ["create_monitor", { site: "s1", name: "Home" }, "POST", "/v1/sites/s1/monitors"],
    ];
    for (const [name, args, method, url] of cases) {
      seen = [];
      const r = await run(name, args);
      expect(r.error, name).toBe(false);
      expect(seen, name).toHaveLength(1);
      expect(seen[0]).toMatchObject({ method, url, client: expect.stringMatching(/^mcp\//), auth: "Bearer satsu_live_test" });
    }
  });

  it("sends only provided fields in write bodies", async () => {
    await run("update_goal", { site: "s1", goal: "g1", matcher: "/thanks" });
    expect(JSON.parse(seen[0].body)).toEqual({ matcher: "/thanks" });
  });
});

describe("plans", () => {
  it("free: summary, pages and sources work", async () => {
    plan = "free";
    for (const [n, a] of [["traffic_summary", { site: "s1" }], ["top_pages", { site: "s1" }], ["top_sources", { site: "s1" }], ["create_goal", { site: "s1", name: "x", type: "path", matcher: "/x" }]] as const) {
      expect((await run(n, a)).error, n).toBe(false);
    }
  });

  it("free: pro tools answer 'available on Pro' with the upgrade link", async () => {
    plan = "free";
    for (const [n, a] of [
      ["ai_traffic", { site: "s1" }],
      ["goal_conversions", { site: "s1", goal: "g" }],
      ["live_visitors", { site: "s1" }],
      ["uptime_status", { site: "s1" }],
      ["audit_results", { site: "s1" }],
      ["start_audit", { site: "s1", pillar: "seo" }],
      ["create_monitor", { site: "s1", name: "m" }],
    ] as const) {
      const r = await run(n, a);
      expect(r, n).toEqual({ error: false, text: "available on Pro: https://satsu.pro/upgrade?from=mcp" });
    }
  });
});

describe("errors", () => {
  it.each([
    [404, /Not found.*no access/],
    [403, /role does not allow/],
    [409, /^Conflict/],
    [401, /npx satsu-analytics login/],
    [429, /Rate limit/],
  ])("%i becomes a plain explanation", async (code, re) => {
    status = code;
    const r = await run("list_sites");
    expect(r.error).toBe(true);
    expect(r.text).toMatch(re);
  });

  it("unreachable API", async () => {
    await new Promise((r) => api.close(r));
    const r = await run("list_sites");
    expect(r.error).toBe(true);
    expect(r.text).toMatch(/Could not reach/);
    api = createHttp();
    await new Promise<void>((r) => api.listen(0, r));
  });

  it("missing credentials tell the user to log in", async () => {
    await client.close();
    await connect(false);
    const r = await run("list_sites");
    expect(r.error).toBe(true);
    expect(r.text).toContain("npx satsu-analytics login");
    expect(seen).toHaveLength(0);
  });
});
