import { spawn } from "node:child_process";
import { hostname } from "node:os";
import * as p from "@clack/prompts";
import { pollAuth, startAuth } from "./api";
import {
  apiUrl,
  CliError,
  type Credentials,
  credentialsPath,
  removeCredentials,
  saveCredentials,
} from "./auth";

export interface Deps {
  env: NodeJS.ProcessEnv;
  open: (url: string) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export const realDeps: Deps = {
  env: process.env,
  open: openBrowser,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
};

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // The URL is printed too; opening is best effort.
  }
}

/** Runs the device-code sign-in and stores the key; null when it didn't complete. */
export async function signIn(deps: Deps): Promise<Credentials | null> {
  const base = apiUrl(deps.env);
  const start = await startAuth(base, `satsu-analytics on ${hostname()}`);
  p.log.message(`Your code: ${start.user_code}`);
  p.log.message(`Approve it in the browser: ${start.verification_url}`);
  deps.open(start.verification_url);

  const spin = p.spinner();
  spin.start("Waiting for approval");
  const deadline = deps.now() + start.expires_in * 1000;
  const wait = start.interval * 1000;
  while (deps.now() < deadline) {
    await deps.sleep(wait);
    const r = await pollAuth(base, start.device_code).catch((e) => {
      spin.error("Sign-in failed");
      throw e;
    });
    if (r.status === "pending") continue;
    if (r.status === "denied") {
      spin.error("Request denied");
      p.log.error("The request was denied in the browser. Run login again to retry.");
      return null;
    }
    if (r.status === "consumed") {
      spin.error("Already used");
      p.log.error("This sign-in was already used. Run `satsu-analytics login` again.");
      return null;
    }
    if (r.status === "expired") break;
    const creds = { apiUrl: base, key: r.key, orgId: r.orgId };
    await saveCredentials(credentialsPath(deps.env), creds);
    spin.stop("Approved");
    return creds;
  }
  spin.error("Code expired");
  p.log.error("The code expired before it was approved. Run login again.");
  return null;
}

export async function login(deps: Deps = realDeps): Promise<boolean> {
  p.intro("satsu-analytics login");
  try {
    const creds = await signIn(deps);
    p.outro(creds ? "Signed in. Credentials are stored in your user config, not in the project." : "Not signed in.");
    return creds !== null;
  } catch (e) {
    if (e instanceof CliError) {
      p.outro(e.message);
      return false;
    }
    throw e;
  }
}

export async function logout(deps: Deps = realDeps): Promise<boolean> {
  const removed = await removeCredentials(credentialsPath(deps.env));
  p.outro(removed ? "Signed out. Local credentials removed." : "You are not signed in.");
  return removed;
}
