import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const DEFAULT_API_URL = "https://api.satsu.pro";

export interface Credentials {
  apiUrl: string;
  key: string;
  orgId: string;
}

export class CliError extends Error {}

export function apiUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.SATSU_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
}

export function credentialsPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "win32") {
    const base = env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(base, "satsu-analytics", "credentials.json");
  }
  const base = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "satsu-analytics", "credentials.json");
}

export async function saveCredentials(path: string, creds: Credentials): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(creds, null, 2) + "\n", { mode: 0o600 });
  // writeFile's mode only applies on creation; tighten an existing file too.
  await chmod(path, 0o600);
}

export async function readCredentials(path: string): Promise<Credentials | null> {
  try {
    const c = JSON.parse(await readFile(path, "utf8"));
    if (typeof c?.apiUrl === "string" && typeof c?.key === "string" && typeof c?.orgId === "string") {
      return c;
    }
    return null;
  } catch {
    return null;
  }
}

export async function removeCredentials(path: string): Promise<boolean> {
  if (!(await readCredentials(path)) && !(await exists(path))) return false;
  await rm(path, { force: true });
  return true;
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}
