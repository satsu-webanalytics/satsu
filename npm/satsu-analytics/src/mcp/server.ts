import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type Credentials, credentialsPath, readCredentials } from "../cli/auth";
import { CLIENT_VERSION } from "../cli/api";
import { type ApiCall, call, LOGIN_HINT, ToolFailure } from "./client";

export interface McpDeps {
  loadCredentials: () => Promise<Credentials | null>;
  fetch: typeof fetch;
}

const realDeps: McpDeps = {
  loadCredentials: () => readCredentials(credentialsPath()),
  fetch: (...a) => fetch(...a),
};

const site = z.string().min(1).describe("Site public ID from list_sites");
const range = {
  from: z.string().optional().describe("Start, YYYY-MM-DD or RFC3339 (default: last 30 days)"),
  to: z.string().optional().describe("End, YYYY-MM-DD or RFC3339"),
};
const pillar = z.enum(["seo", "a11y", "security", "gdpr", "perf"]);
const goalType = z.enum(["custom_event", "path"]);

const enc = encodeURIComponent;

const AGGREGATES = "Returns aggregated numbers only, never data about individual visitors.";

export function createServer(deps: McpDeps = realDeps): McpServer {
  const server = new McpServer({ name: "satsu-analytics", version: CLIENT_VERSION });

  // Every tool is exactly one public-api call; plan gating, roles and limits are the API's call.
  function tool<S extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: S,
    build: (a: z.objectOutputType<S, z.ZodTypeAny>) => ApiCall,
  ): void {
    // The SDK's callback typing can't follow a generic shape; the shape is what validates args.
    const handler = async (args: z.objectOutputType<S, z.ZodTypeAny>) => {
      try {
        const creds = await deps.loadCredentials();
        if (!creds) throw new ToolFailure(LOGIN_HINT);
        const data = await call(creds, build(args), deps.fetch);
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
      } catch (e) {
        const text = e instanceof ToolFailure ? e.message : "Unexpected error talking to Satsu.";
        return { isError: !(e instanceof ToolFailure) || e.isError, content: [{ type: "text" as const, text }] };
      }
    };
    server.tool(name, description, shape, handler as never);
  }

  tool("list_sites", `List the sites this key can read, with ID, name and domain. ${AGGREGATES}`, {}, () => ({
    method: "GET",
    path: "/v1/sites",
  }));

  tool(
    "traffic_summary",
    `Visitors, pageviews and related totals for a site over a period. Free plan: last 7 or 30 days. ${AGGREGATES}`,
    { site, ...range },
    (a) => ({ method: "GET", path: `/v1/sites/${enc(a.site)}/overview`, query: { from: a.from, to: a.to } }),
  );

  tool("top_pages", `Most viewed pages of a site. ${AGGREGATES}`, { site, ...range }, (a) => ({
    method: "GET",
    path: `/v1/sites/${enc(a.site)}/breakdown/pages`,
    query: { from: a.from, to: a.to },
  }));

  tool("top_sources", `Top referrers of a site. ${AGGREGATES}`, { site, ...range }, (a) => ({
    method: "GET",
    path: `/v1/sites/${enc(a.site)}/breakdown/referrers`,
    query: { from: a.from, to: a.to },
  }));

  tool(
    "ai_traffic",
    `Traffic by channel; the "AI" row is visits that came from AI assistants such as ChatGPT or Perplexity. Pro plan. ${AGGREGATES}`,
    { site, ...range },
    (a) => ({
      method: "GET",
      path: `/v1/sites/${enc(a.site)}/breakdown/channels`,
      query: { from: a.from, to: a.to },
    }),
  );

  tool(
    "breakdown",
    `Break a site's traffic down by one dimension. pages and referrers are on every plan, the rest need Pro. ${AGGREGATES}`,
    {
      site,
      dimension: z.enum([
        "pages",
        "referrers",
        "campaigns",
        "channels",
        "countries",
        "devices",
        "browsers",
        "operating-systems",
        "events",
      ]),
      ...range,
    },
    (a) => ({
      method: "GET",
      path: `/v1/sites/${enc(a.site)}/breakdown/${a.dimension}`,
      query: { from: a.from, to: a.to },
    }),
  );

  tool("goals", "List a site's goals with their IDs, names and rules.", { site }, (a) => ({
    method: "GET",
    path: `/v1/sites/${enc(a.site)}/goals`,
  }));

  tool(
    "goal_conversions",
    `Conversions for one goal over a period. Pro plan. ${AGGREGATES}`,
    { site, goal: z.string().min(1).describe("Goal ID from goals"), ...range },
    (a) => ({
      method: "GET",
      path: `/v1/sites/${enc(a.site)}/goals/${enc(a.goal)}/conversions`,
      query: { from: a.from, to: a.to },
    }),
  );

  tool(
    "live_visitors",
    "How many visitors are on the site right now, as a count. Pro plan.",
    { site },
    (a) => ({ method: "GET", path: `/v1/sites/${enc(a.site)}/live` }),
  );

  tool(
    "uptime_status",
    "Uptime monitors of a site with their current status and TLS state. Pro plan.",
    { site },
    (a) => ({ method: "GET", path: `/v1/sites/${enc(a.site)}/monitors` }),
  );

  tool(
    "audit_results",
    "Latest audit result per pillar (seo, a11y, security, gdpr, perf) for a site. Pro plan.",
    { site },
    (a) => ({ method: "GET", path: `/v1/sites/${enc(a.site)}/audits` }),
  );

  tool(
    "create_site",
    "Create a site in a workspace. The domain is optional and can be set later with set_site_domain.",
    {
      workspace: z.string().min(1).describe("Workspace ID"),
      name: z.string().min(1).max(100),
      domain: z.string().optional().describe("Production domain, e.g. example.com"),
    },
    (a) => ({ method: "POST", path: "/v1/sites", body: { workspace: a.workspace, name: a.name, domain: a.domain } }),
  );

  tool(
    "set_site_domain",
    "Set the production domain of a site. Audits and uptime monitors need it.",
    { site, domain: z.string().min(1).describe("Production domain, e.g. example.com") },
    (a) => ({ method: "PATCH", path: `/v1/sites/${enc(a.site)}`, body: { domain: a.domain } }),
  );

  tool(
    "create_goal",
    "Create a conversion goal: `custom_event` matches an event name, `path` matches a page path.",
    {
      site,
      name: z.string().min(1).max(100),
      type: goalType,
      matcher: z.string().min(1).max(200).describe("Event name or page path"),
    },
    (a) => ({
      method: "POST",
      path: `/v1/sites/${enc(a.site)}/goals`,
      body: { name: a.name, type: a.type, matcher: a.matcher },
    }),
  );

  tool(
    "update_goal",
    "Rename a goal or change its rule. Pass only the fields to change.",
    {
      site,
      goal: z.string().min(1).describe("Goal ID from goals"),
      name: z.string().min(1).max(100).optional(),
      type: goalType.optional(),
      matcher: z.string().min(1).max(200).optional(),
    },
    (a) => ({
      method: "PATCH",
      path: `/v1/sites/${enc(a.site)}/goals/${enc(a.goal)}`,
      body: { name: a.name, type: a.type, matcher: a.matcher },
    }),
  );

  tool(
    "start_audit",
    "Start an audit of a site now. Pro plan; the site needs a domain. Read the outcome later with audit_results.",
    { site, pillar: pillar.describe("Audit type") },
    (a) => ({ method: "POST", path: `/v1/sites/${enc(a.site)}/audits/${a.pillar}/run` }),
  );

  tool(
    "create_monitor",
    "Create an uptime monitor for a site. Pro plan; the URL defaults to the site's domain.",
    {
      site,
      name: z.string().min(1).max(100),
      url: z.string().url().optional().describe("http(s) URL to check"),
    },
    (a) => ({ method: "POST", path: `/v1/sites/${enc(a.site)}/monitors`, body: { name: a.name, url: a.url } }),
  );

  return server;
}
