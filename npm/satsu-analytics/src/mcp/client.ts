import { CLIENT_VERSION } from "../cli/api";

export const LOGIN_HINT = "Not signed in to Satsu. Run `npx satsu-analytics login` in a terminal, then try again.";

/** An API answer that isn't 2xx, already phrased for the agent's user. */
export class ToolFailure extends Error {
  /** A plan gate is an answer for the user, not a failure of the tool. */
  constructor(
    message: string,
    readonly isError = true,
  ) {
    super(message);
  }
}

export type Method = "GET" | "POST" | "PATCH";

export interface ApiCall {
  method: Method;
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

function field(body: any, name: string): string | undefined {
  const v = body?.[name] ?? body?.error?.[name];
  return typeof v === "string" && v ? v : undefined;
}

/** Maps a non-2xx answer to a plain sentence; 404 never hints at existence (non-members get 404). */
export function explain(status: number, body: any): string {
  const detail = field(body, "message") ?? (typeof body?.error === "string" ? body.error : undefined);
  switch (status) {
    case 401:
      return "Your Satsu key is no longer valid. Run `npx satsu-analytics login` to sign in again.";
    case 402: {
      const url = field(body, "upgrade_url");
      return url ? `available on Pro: ${url}` : "available on Pro: https://satsu.pro/pricing";
    }
    case 403:
      return detail === "user_key_required"
        ? "This action needs a key created by a signed-in user. Run `npx satsu-analytics login`."
        : "Your Satsu role does not allow this. Ask an owner or admin of the workspace to do it in the dashboard.";
    case 404:
      return "Not found. The site, goal or monitor does not exist, or your key has no access to it.";
    case 409:
      return `Conflict: ${detail ?? "this already exists or conflicts with the current state"}.`;
    case 422:
    case 400:
      return `Satsu rejected the input${detail ? `: ${detail}` : ""}.`;
    case 429:
      return "Rate limit reached. Wait a minute and try again.";
    default:
      return status >= 500 ? "Satsu is unavailable right now. Try again later." : `Satsu answered ${status}.`;
  }
}

export async function call(
  creds: { apiUrl: string; key: string },
  req: ApiCall,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined) qs.set(k, v);
  const url = `${creds.apiUrl}${req.path}${qs.size ? `?${qs}` : ""}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: req.method,
      headers: {
        authorization: `Bearer ${creds.key}`,
        "x-satsu-client": `mcp/${CLIENT_VERSION}`,
        ...(req.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
    });
  } catch {
    throw new ToolFailure(`Could not reach ${creds.apiUrl}. Check the connection and try again.`);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // Error bodies may be empty.
  }
  if (!res.ok) throw new ToolFailure(explain(res.status, json), res.status !== 402);
  if (json === null) throw new ToolFailure("Satsu returned an unreadable response.");
  return json;
}
