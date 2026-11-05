import { CliError } from "./auth";

export const CLIENT_VERSION: string = process.env.SATSU_CLI_VERSION ?? "0.0.0";

export interface StartResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  interval: number;
  expires_in: number;
}

export type PollResult =
  | { status: "pending" }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "consumed" }
  | { status: "approved"; key: string; orgId: string };

async function post(base: string, path: string, body: unknown): Promise<Record<string, any>> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-satsu-client": `cli/${CLIENT_VERSION}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CliError(`Could not reach ${base}. Check your connection and try again.`);
  }
  if (res.status === 429) throw new CliError("Too many attempts. Wait a minute and try again.");
  if (!res.ok) throw new CliError(`Satsu API answered ${res.status}. Try again later.`);
  try {
    return (await res.json()) as Record<string, any>;
  } catch {
    throw new CliError("Satsu API returned an unreadable response.");
  }
}

/** An API answer that isn't 2xx; `status` lets callers react to 401/402/404. */
export class ApiError extends CliError {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function errorMessage(status: number, body: Record<string, any> | null): string {
  const e = body?.error;
  if (status === 402) {
    const msg = typeof e?.message === "string" ? e.message : "This needs a paid plan.";
    const url = body?.upgrade_url ?? e?.upgrade_url;
    return typeof url === "string" ? `${msg} Upgrade: ${url}` : msg;
  }
  if (status === 401) return "Your Satsu key is no longer valid. Run `npx satsu-analytics login`.";
  if (typeof e?.message === "string") return `${e.message} (${status})`;
  return `Satsu API answered ${status}. Try again later.`;
}

/** Calls a Bearer-authenticated public-api route. */
export async function authed<T = Record<string, any>>(
  base: string,
  key: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        "x-satsu-client": `cli/${CLIENT_VERSION}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new CliError(`Could not reach ${base}. Check your connection and try again.`);
  }
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // Error bodies may be empty; success bodies are checked below.
  }
  if (!res.ok) throw new ApiError(res.status, errorMessage(res.status, json));
  if (json === null) throw new CliError("Satsu API returned an unreadable response.");
  return json as T;
}

export interface Workspace {
  id: string;
  name: string;
}

export async function listWorkspaces(base: string, key: string): Promise<Workspace[]> {
  const r = await authed<any>(base, key, "GET", "/v1/workspaces");
  const list: unknown[] = Array.isArray(r) ? r : Array.isArray(r?.workspaces) ? r.workspaces : [];
  return list
    .filter((w: any) => typeof w?.id === "string")
    .map((w: any) => ({ id: w.id, name: typeof w.name === "string" ? w.name : w.id }));
}

/** Creates a site and returns its public ID (the value of `data-site`). */
export async function createSite(
  base: string,
  key: string,
  input: { workspace: string; name: string; domain?: string },
): Promise<string> {
  const r = await authed<any>(base, key, "POST", "/v1/sites", input);
  const site = r?.site ?? r;
  const id = site?.publicId ?? site?.public_id ?? site?.id;
  if (typeof id !== "string" || !id) throw new CliError("Satsu API returned a site without an ID.");
  return id;
}

export interface InstallCheck {
  devPingAt: string | null;
  firstEventAt: string | null;
}

export async function installCheck(base: string, key: string, site: string): Promise<InstallCheck> {
  const r = await authed<any>(base, key, "GET", `/v1/sites/${encodeURIComponent(site)}/install-check`);
  return { devPingAt: r?.dev_ping_at ?? null, firstEventAt: r?.first_event_at ?? null };
}

export async function startAuth(base: string, clientName: string): Promise<StartResponse> {
  const r = await post(base, "/v1/cli/auth/start", { client_name: clientName });
  if (!r.device_code || !r.user_code || !r.verification_url) {
    throw new CliError("Satsu API returned an incomplete sign-in request.");
  }
  return {
    device_code: r.device_code,
    user_code: r.user_code,
    verification_url: r.verification_url,
    interval: Number(r.interval) > 0 ? Number(r.interval) : 2,
    expires_in: Number(r.expires_in) > 0 ? Number(r.expires_in) : 600,
  };
}

export async function pollAuth(base: string, deviceCode: string): Promise<PollResult> {
  const r = await post(base, "/v1/cli/auth/poll", { device_code: deviceCode });
  if (typeof r.key === "string") {
    const org = r.org;
    const orgId = typeof org === "string" ? org : org?.id;
    if (!orgId) throw new CliError("Satsu API returned a key without an organization.");
    return { status: "approved", key: r.key, orgId: String(orgId) };
  }
  if (r.status === "denied" || r.status === "expired" || r.status === "consumed" || r.status === "pending") {
    return { status: r.status };
  }
  throw new CliError("Satsu API returned an unexpected sign-in state.");
}
