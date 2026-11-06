import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { credentialsPath, saveCredentials } from "../src/cli/auth";
import { init, type InitDeps } from "../src/cli/init";

const ui = vi.hoisted(() => ({
  answers: [] as Array<[RegExp, unknown]>,
  asked: [] as string[],
  printed: [] as string[],
}));

vi.mock("@clack/prompts", () => {
  const CANCEL = Symbol("cancel");
  const reply = (message: string, fallback: unknown) => {
    ui.asked.push(message);
    const i = ui.answers.findIndex(([re]) => re.test(message));
    if (i === -1) return fallback;
    return ui.answers.splice(i, 1)[0]![1];
  };
  const print = (s: string) => void ui.printed.push(s);
  return {
    intro: vi.fn(),
    outro: vi.fn(print),
    cancel: vi.fn(print),
    note: vi.fn((body: string, title: string) => print(`${title}\n${body}`)),
    log: { message: print, info: print, warn: print, step: print, success: print, error: print },
    spinner: () => ({ start: vi.fn(), stop: vi.fn(print), error: vi.fn(print) }),
    isCancel: (v: unknown) => v === CANCEL,
    confirm: async ({ message }: { message: string }) => reply(message, true),
    select: async ({ message, initialValue }: { message: string; initialValue?: unknown }) =>
      reply(message, initialValue),
    text: async ({ message }: { message: string }) => reply(message, CANCEL),
  };
});

interface Call {
  method: string;
  url: string;
  auth?: string;
  body?: any;
}

let server: Server;
let base: string;
let calls: Call[];
let workspaces: unknown;
let existingSites: unknown[];
let installChecks: Array<Record<string, unknown>>;
let createStatus: number;
let configDir: string;
let ran: Array<[string, string[]]>;
let clock: number;

async function body(req: IncomingMessage): Promise<any> {
  let s = "";
  for await (const chunk of req) s += chunk;
  return s ? JSON.parse(s) : undefined;
}

beforeEach(async () => {
  ui.answers = [];
  ui.asked = [];
  ui.printed = [];
  calls = [];
  ran = [];
  clock = 0;
  createStatus = 201;
  workspaces = { workspaces: [{ id: "ws_1", name: "Acme" }] };
  existingSites = [];
  installChecks = [{ dev_ping_at: null, first_event_at: null }, { dev_ping_at: "2026-11-04T10:00:00Z", first_event_at: null }];
  server = createServer(async (req, res) => {
    const call: Call = { method: req.method!, url: req.url!, auth: req.headers.authorization, body: await body(req) };
    calls.push(call);
    res.setHeader("content-type", "application/json");
    const send = (status: number, json: unknown) => {
      res.statusCode = status;
      res.end(JSON.stringify(json));
    };
    if (req.url === "/v1/cli/auth/start") {
      return send(200, { device_code: "dev", user_code: "AB-12", verification_url: "https://x/cli", interval: 2, expires_in: 600 });
    }
    if (req.url === "/v1/cli/auth/poll") return send(200, { key: "satsu_live_new", org: { id: "org_1" } });
    if (req.headers.authorization === "Bearer satsu_live_revoked") {
      return send(401, { error: { code: "unauthorized", message: "invalid key" } });
    }
    if (req.url === "/v1/workspaces") return send(200, workspaces);
    if (req.url === "/v1/sites" && req.method === "GET") return send(200, { sites: existingSites });
    if (req.url === "/v1/sites" && req.method === "POST") {
      if (createStatus === 402) {
        return send(402, { error: { code: "plan_limit_reached", message: "Your plan allows 1 site." } });
      }
      return send(201, { id: "0b6c-uuid", publicId: "site_new42", name: call.body.name, domain: call.body.domain ?? null });
    }
    if (req.url === "/v1/sites/site_new42/install-check" || req.url === "/v1/sites/site_legacy1/install-check") {
      return send(200, installChecks.shift() ?? { dev_ping_at: null, first_event_at: null });
    }
    send(404, { error: { code: "not_found", message: "not found" } });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  configDir = mkdtempSync(join(tmpdir(), "satsu-cfg-"));
});

afterEach(() => new Promise<void>((r) => server.close(() => r())));

function project(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `satsu-init-${name}-`));
  cpSync(new URL(`./fixtures/${name}/`, import.meta.url).pathname, dir, { recursive: true });
  return dir;
}

function deps(cwd: string): InitDeps {
  return {
    cwd,
    home: configDir,
    env: { SATSU_API_URL: base, XDG_CONFIG_HOME: configDir },
    open: () => {},
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    run: async (cmd, args) => {
      ran.push([cmd, args]);
      return true;
    },
  };
}

async function signedIn(key = "satsu_live_stored"): Promise<void> {
  await saveCredentials(credentialsPath({ XDG_CONFIG_HOME: configDir }), { apiUrl: base, key, orgId: "org_1" });
}

const file = (dir: string, rel: string) => readFileSync(join(dir, rel), "utf8");
const printed = () => ui.printed.join("\n");

describe("init — connect the coding agent", () => {
  it("writes the Claude Code config, merging existing servers, without any key", async () => {
    await signedIn();
    const dir = project("next-app");
    writeFileSync(join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }));
    ui.answers.push([/Which editor/, "claude"]);
    expect(await init(deps(dir))).toBe(true);
    const cfg = JSON.parse(file(dir, ".mcp.json"));
    expect(Object.keys(cfg.mcpServers)).toEqual(["other", "satsu"]);
    expect(cfg.mcpServers.satsu.args).toEqual(["-y", "satsu-analytics", "mcp"]);
    expect(file(dir, ".mcp.json")).not.toContain("satsu_live_");
  });

  it("prints the config for other editors and skips on no", async () => {
    await signedIn();
    const dir = project("next-app");
    ui.answers.push([/Which editor/, "other"]);
    expect(await init(deps(dir))).toBe(true);
    expect(printed()).toContain('"mcpServers"');
    expect(existsSync(join(dir, ".mcp.json"))).toBe(false);

    ui.printed = [];
    ui.answers.push([/Connect your coding agent/, false]);
    expect(await init(deps(project("next-app")))).toBe(true);
    expect(ui.asked.filter((m) => /Which editor/.test(m))).toHaveLength(1);
  });
});

describe("init — Next.js App Router", () => {
  it("signs in, creates the site with the detected domain, writes layout and .env.local, waits for the ping", async () => {
    const dir = project("next-app");
    expect(await init(deps(dir))).toBe(true);

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /v1/cli/auth/start",
      "POST /v1/cli/auth/poll",
      "GET /v1/sites",
      "GET /v1/workspaces",
      "POST /v1/sites",
      "GET /v1/sites/site_new42/install-check",
      "GET /v1/sites/site_new42/install-check",
    ]);
    const create = calls.find((c) => c.url === "/v1/sites" && c.method === "POST")!;
    expect(create.auth).toBe("Bearer satsu_live_new");
    expect(create.body).toEqual({ workspace: "ws_1", name: "acme.dev", domain: "acme.dev" });

    expect(file(dir, "app/layout.tsx")).toContain(`import { Satsu } from "satsu-analytics/next";`);
    expect(file(dir, "app/layout.tsx")).toContain("{children}\n        <Satsu />\n      </body>");
    expect(file(dir, ".env.local")).toBe("NEXT_PUBLIC_SATSU_SITE=site_new42\n");
    expect(printed()).toContain("+ NEXT_PUBLIC_SATSU_SITE=site_new42");
    expect(printed()).toContain("+         <Satsu />");
    expect(printed()).toContain("✓ Satsu is receiving events");
    expect(ran).toEqual([["npm", ["install", "satsu-analytics"]]]);
    // One login poll interval, then one install-check interval.
    expect(clock).toBe(4_000);
  });

  it("'Not yet' creates the site without a domain, named after the package", async () => {
    await signedIn();
    ui.answers.push([/Production domain/, "\0none"]);
    const dir = project("next-app");
    expect(await init(deps(dir))).toBe(true);
    expect(calls.find((c) => c.url === "/v1/sites" && c.method === "POST")!.body).toEqual({ workspace: "ws_1", name: "acme-web" });
  });

  it("asks for a domain when one is typed in", async () => {
    await signedIn();
    ui.answers.push([/Production domain/, "\0other"], [/^Domain$/, "https://www.Typed.io/"]);
    expect(await init(deps(project("next-app")))).toBe(true);
    expect(calls.find((c) => c.url === "/v1/sites" && c.method === "POST")!.body.domain).toBe("www.typed.io");
  });

  it("offers the user's existing sites and preselects the one matching the project's domain", async () => {
    await signedIn();
    existingSites = [
      { id: "site_other", name: "Blog", domain: "blog.example" },
      { id: "site_legacy1", name: "Acme", domain: "acme.dev" },
    ];
    const dir = project("next-app");
    expect(await init(deps(dir))).toBe(true);
    expect(calls.some((c) => c.url === "/v1/sites" && c.method === "POST")).toBe(false);
    expect(file(dir, ".env.local")).toContain("NEXT_PUBLIC_SATSU_SITE=site_legacy1");
    expect(printed()).toContain("Using site Acme (site_legacy1).");
  });

  it("creates a new site when the user picks that over the existing ones", async () => {
    await signedIn();
    existingSites = [{ id: "site_other", name: "Blog", domain: "blog.example" }];
    ui.answers.push([/Which Satsu site/, "\0new"]);
    expect(await init(deps(project("next-app")))).toBe(true);
    expect(calls.find((c) => c.url === "/v1/sites" && c.method === "POST")!.body.workspace).toBe("ws_1");
  });

  it("picks among several workspaces", async () => {
    await signedIn();
    workspaces = [
      { id: "ws_1", name: "Acme" },
      { id: "ws_2", name: "Side projects" },
    ];
    ui.answers.push([/Workspace/, "ws_2"]);
    expect(await init(deps(project("next-app")))).toBe(true);
    expect(calls.find((c) => c.url === "/v1/sites" && c.method === "POST")!.body.workspace).toBe("ws_2");
  });

  it("writes nothing when the diff is declined and prints manual steps", async () => {
    await signedIn();
    ui.answers.push([/Write these changes/, false]);
    const dir = project("next-app");
    const before = file(dir, "app/layout.tsx");
    expect(await init(deps(dir))).toBe(true);
    expect(file(dir, "app/layout.tsx")).toBe(before);
    expect(existsSync(join(dir, ".env.local"))).toBe(false);
    expect(printed()).toContain("NEXT_PUBLIC_SATSU_SITE=site_new42");
    expect(printed()).toContain("render <Satsu /> once, inside <body>");
  });

  it("never overwrites an existing env value silently", async () => {
    await signedIn();
    const dir = project("next-app");
    writeFileSync(join(dir, ".env.local"), "DATABASE_URL=postgres://x\nNEXT_PUBLIC_SATSU_SITE=site_other\n");
    ui.answers.push([/already uses Satsu site site_other/, false], [/Replace it with site_new42/, false]);
    expect(await init(deps(dir))).toBe(true);
    expect(file(dir, ".env.local")).toBe("DATABASE_URL=postgres://x\nNEXT_PUBLIC_SATSU_SITE=site_other\n");
    expect(ui.asked.some((q) => q.includes("Replace it with site_new42"))).toBe(true);
  });

  it("keeps using the site already in .env.local without creating one", async () => {
    await signedIn();
    const dir = project("next-app");
    writeFileSync(join(dir, ".env.local"), "NEXT_PUBLIC_SATSU_SITE=site_new42\n");
    expect(await init(deps(dir))).toBe(true);
    expect(calls.some((c) => c.url === "/v1/sites" && c.method === "POST")).toBe(false);
    expect(file(dir, ".env.local")).toBe("NEXT_PUBLIC_SATSU_SITE=site_new42\n");
  });

  it("falls back to manual steps when the layout can't be parsed", async () => {
    await signedIn();
    const dir = project("next-app");
    writeFileSync(join(dir, "app/layout.tsx"), "export { default } from './shell';\n");
    expect(await init(deps(dir))).toBe(true);
    expect(file(dir, "app/layout.tsx")).toBe("export { default } from './shell';\n");
    expect(file(dir, ".env.local")).toBe("NEXT_PUBLIC_SATSU_SITE=site_new42\n");
    expect(printed()).toContain("could not find </body>");
    expect(printed()).toContain(`import { Satsu } from "satsu-analytics/next"`);
    expect(printed()).toContain("https://satsu.pro/docs/frameworks/nextjs");
  });

  it("is idempotent on a second run", async () => {
    await signedIn();
    const dir = project("next-app");
    await init(deps(dir));
    const layout = file(dir, "app/layout.tsx");
    calls = [];
    expect(await init(deps(dir))).toBe(true);
    expect(file(dir, "app/layout.tsx")).toBe(layout);
    expect(layout.match(/<Satsu \/>/g)).toHaveLength(1);
    expect(calls.some((c) => c.url === "/v1/sites" && c.method === "POST")).toBe(false);
  });

  it("signs in again when the stored key was revoked", async () => {
    await signedIn("satsu_live_revoked");
    expect(await init(deps(project("next-app")))).toBe(true);
    expect(calls.filter((c) => c.url === "/v1/sites" && c.method === "GET").map((c) => c.auth)).toEqual([
      "Bearer satsu_live_revoked",
      "Bearer satsu_live_new",
    ]);
    expect(calls.find((c) => c.url === "/v1/sites" && c.method === "POST")!.auth).toBe("Bearer satsu_live_new");
  });

  it("reports a plan limit without writing code", async () => {
    await signedIn();
    createStatus = 402;
    const dir = project("next-app");
    const before = file(dir, "app/layout.tsx");
    expect(await init(deps(dir))).toBe(false);
    expect(printed()).toContain("Your plan allows 1 site.");
    expect(file(dir, "app/layout.tsx")).toBe(before);
  });

  it("stops cleanly when there is no workspace to add sites to", async () => {
    await signedIn();
    workspaces = [];
    expect(await init(deps(project("next-app")))).toBe(false);
    expect(printed()).toContain("can't add sites to any workspace");
  });
});

describe("init — Next.js Pages Router", () => {
  it("replaces the existing script tag only after asking and reuses its site", async () => {
    await signedIn();
    const dir = project("next-pages");
    expect(await init(deps(dir))).toBe(true);
    expect(ui.asked[0]).toContain("Found a Satsu script tag in pages/_document.tsx");
    expect(calls.some((c) => c.url === "/v1/sites" && c.method === "POST")).toBe(false);
    expect(file(dir, "pages/_document.tsx")).not.toContain("tracker.js");
    expect(file(dir, "pages/_app.tsx")).toContain("<Satsu />");
    expect(file(dir, ".env.local")).toBe("NEXT_PUBLIC_SATSU_SITE=site_legacy1\n");
  });

  it("keeps the script tag and changes nothing when the user says no", async () => {
    await signedIn();
    ui.answers.push([/Found a Satsu script tag/, false]);
    const dir = project("next-pages");
    const doc = file(dir, "pages/_document.tsx");
    const app = file(dir, "pages/_app.tsx");
    expect(await init(deps(dir))).toBe(true);
    expect(file(dir, "pages/_document.tsx")).toBe(doc);
    expect(file(dir, "pages/_app.tsx")).toBe(app);
    expect(calls).toEqual([]);
  });

  it("creates pages/_app when missing", async () => {
    await signedIn();
    const dir = project("next-pages");
    rmSync(join(dir, "pages/_app.tsx"));
    rmSync(join(dir, "pages/_document.tsx"));
    ui.answers.push([/Production domain/, "\0none"]);
    expect(await init(deps(dir))).toBe(true);
    expect(file(dir, "pages/_app.jsx")).toContain(`import { Satsu } from "satsu-analytics/next";`);
    expect(printed()).toContain("new file pages/_app.jsx");
  });
});

describe("init — React (Vite)", () => {
  it("inserts into src/main.tsx, writes VITE_SATSU_SITE and suggests the CNAME domain", async () => {
    await signedIn();
    const dir = project("vite-react");
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    expect(await init(deps(dir))).toBe(true);
    expect(calls.find((c) => c.url === "/v1/sites" && c.method === "POST")!.body).toEqual({
      workspace: "ws_1",
      name: "shop.example.org",
      domain: "shop.example.org",
    });
    expect(file(dir, "src/main.tsx")).toContain("import { Satsu } from 'satsu-analytics/react'");
    expect(file(dir, "src/main.tsx")).toContain("<App />\n    <Satsu />");
    expect(file(dir, ".env.local")).toBe("VITE_SATSU_SITE=site_new42\n");
    expect(ran).toEqual([["pnpm", ["add", "satsu-analytics"]]]);
  });

  it("removes a script tag from index.html after asking", async () => {
    await signedIn();
    const dir = project("vite-react");
    const html = file(dir, "index.html");
    writeFileSync(
      join(dir, "index.html"),
      html.replace("</head>", `  <script defer src="https://track.satsu.pro/tracker.js" data-site="site_legacy1"></script>\n  </head>`),
    );
    expect(await init(deps(dir))).toBe(true);
    expect(file(dir, "index.html")).toBe(html);
    expect(printed()).toContain("- ");
  });

  it("skips the install check and the package install when declined", async () => {
    await signedIn();
    ui.answers.push([/Install satsu-analytics/, false], [/Wait here for the test event/, false]);
    expect(await init(deps(project("vite-react")))).toBe(true);
    expect(ran).toEqual([]);
    expect(calls.some((c) => c.url.endsWith("/install-check"))).toBe(false);
    expect(printed()).toContain("Skipped.");
  });

  it("gives up waiting after 3 minutes, polling every 2 s", async () => {
    await signedIn();
    installChecks = [];
    expect(await init(deps(project("vite-react")))).toBe(true);
    expect(calls.filter((c) => c.url.endsWith("/install-check"))).toHaveLength(90);
    expect(printed()).toContain("No test event yet");
  });

  it("counts a real first event as success too", async () => {
    await signedIn();
    installChecks = [{ dev_ping_at: null, first_event_at: "2026-11-04T10:00:00Z" }];
    expect(await init(deps(project("vite-react")))).toBe(true);
    expect(printed()).toContain("✓ Satsu is receiving events");
  });
});

describe("init — unsupported projects", () => {
  it("prints the script tag with a new site and the framework's docs link", async () => {
    await signedIn();
    const dir = mkdtempSync(join(tmpdir(), "satsu-init-nuxt-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "nuxt-shop", dependencies: { nuxt: "^4" } }));
    ui.answers.push([/Production domain/, "\0none"]);
    expect(await init(deps(dir))).toBe(true);
    expect(printed()).toContain('src="https://track.satsu.pro/tracker.js"\n  data-site="site_new42"');
    expect(printed()).toContain("https://satsu.pro/docs/frameworks/vue-nuxt");
    expect(existsSync(join(dir, ".env.local"))).toBe(false);
  });

  it("prints a placeholder tag without signing in when declined", async () => {
    ui.answers.push([/Create or pick a Satsu site/, false]);
    const dir = mkdtempSync(join(tmpdir(), "satsu-init-none-"));
    expect(await init(deps(dir))).toBe(true);
    expect(printed()).toContain('data-site="YOUR_SITE_ID"');
    expect(printed()).toContain("https://satsu.pro/docs/install");
    expect(calls).toEqual([]);
  });
});

describe("init — Vue, Nuxt, Astro, SvelteKit, Remix", () => {
  beforeEach(() => {
    ui.answers.push([/Production domain/, "\0none"]);
  });

  it.each([
    ["nuxt-app", "nuxt.config.ts", 'modules: ["satsu-analytics/nuxt"', ".env", "NUXT_PUBLIC_SATSU_SITE=site_new42\n"],
    ["vue-vite", "src/App.vue", 'import { Satsu } from "satsu-analytics/vue"', ".env.local", "VITE_SATSU_SITE=site_new42\n"],
    ["astro-site", "src/layouts/Layout.astro", 'import Satsu from "satsu-analytics/astro"', ".env", "PUBLIC_SATSU_SITE=site_new42\n"],
    ["sveltekit-app", "src/routes/+layout.svelte", "<Satsu />", ".env", "PUBLIC_SATSU_SITE=site_new42\n"],
    ["remix-app", "app/root.tsx", 'import { Satsu } from "satsu-analytics/remix"', ".env", "VITE_SATSU_SITE=site_new42\n"],
  ])("%s: shows the diff, writes the entry file and the env file", async (name, target, snippet, envFile, envBody) => {
    await signedIn();
    const dir = project(name);
    expect(await init(deps(dir))).toBe(true);
    expect(file(dir, target)).toContain(snippet);
    expect(file(dir, envFile)).toBe(envBody);
    expect(printed()).toContain(`changes in ${target}`);
    expect(printed()).toContain("✓ Satsu is receiving events");
    expect(ran).toEqual([["npm", ["install", "satsu-analytics"]]]);
  });

  it("is idempotent on a second run", async () => {
    await signedIn();
    const dir = project("astro-site");
    await init(deps(dir));
    const once = file(dir, "src/layouts/Layout.astro");
    ui.answers.push([/already uses Satsu site/, true]);
    await init(deps(dir));
    expect(file(dir, "src/layouts/Layout.astro")).toBe(once);
  });

  it("creates +layout.svelte when SvelteKit has none", async () => {
    await signedIn();
    const dir = project("sveltekit-app");
    rmSync(join(dir, "src/routes/+layout.svelte"));
    await init(deps(dir));
    expect(printed()).toContain("new file src/routes/+layout.svelte");
    expect(file(dir, "src/routes/+layout.svelte")).toContain("{@render children()}\n<Satsu />");
  });

  it("falls back to manual steps when the Nuxt config can't be parsed", async () => {
    await signedIn();
    const dir = project("nuxt-app");
    writeFileSync(join(dir, "nuxt.config.ts"), "export default config;\n");
    await init(deps(dir));
    expect(file(dir, "nuxt.config.ts")).toBe("export default config;\n");
    expect(printed()).toContain('add "satsu-analytics/nuxt" to the modules array');
    expect(file(dir, ".env")).toBe("NUXT_PUBLIC_SATSU_SITE=site_new42\n");
  });
});
