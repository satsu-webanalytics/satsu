import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as p from "@clack/prompts";
import { TRACKER_SRC } from "../core";
import { detectEditors, EDITORS, printedConfig, writeMcpConfig, type Editor } from "./agent";
import { ApiError, createSite, installCheck, listWorkspaces } from "./api";
import { CliError, credentialsPath, readCredentials, removeCredentials, type Credentials } from "./auth";
import {
  findScriptTag,
  hasSatsuComponent,
  IMPORT_SOURCE,
  insertComponent,
  newPagesApp,
  newSvelteLayout,
  PLACEMENT,
  readEnvValue,
  removeScriptTag,
  setEnvValue,
} from "./codemod";
import { realDeps, signIn, type Deps } from "./commands";
import {
  detectFramework,
  detectPackageManager,
  hasPackage,
  normalizeDomain,
  projectName,
  suggestDomains,
  type PackageManager,
  type Supported,
} from "./detect";
import { formatDiff } from "./diff";

export interface InitDeps extends Deps {
  cwd: string;
  /** Home directory for user-level editor configs (Windsurf). */
  home?: string;
  /** Runs a command in the project; resolves to whether it exited 0. */
  run: (cmd: string, args: string[], cwd: string) => Promise<boolean>;
}

export const realInitDeps: InitDeps = {
  ...realDeps,
  cwd: process.cwd(),
  run: (cmd, args, cwd) =>
    new Promise((resolve) => {
      const child = spawn(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
      child.on("error", () => resolve(false));
      child.on("exit", (code) => resolve(code === 0));
    }),
};

export const INSTALL_CHECK_INTERVAL_MS = 2_000;
export const INSTALL_CHECK_TIMEOUT_MS = 180_000;

class Cancelled extends Error {}

function answer<T>(v: T): Exclude<T, symbol> {
  if (p.isCancel(v)) throw new Cancelled();
  return v as Exclude<T, symbol>;
}

async function ask(message: string, initialValue = true): Promise<boolean> {
  return answer(await p.confirm({ message, initialValue }));
}

interface FileEdit {
  path: string;
  before: string | null;
  after: string;
}

interface CodePlan {
  edits: FileEdit[];
  /** Set when the component couldn't be placed automatically. */
  manual: string | null;
  /** Site ID from an existing script tag, if any. */
  tagSite: string | null;
  /** The user kept an existing script tag: nothing to change in code. */
  keepTag: boolean;
}

async function readOpt(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/** Works out the code changes before anything is created remotely. */
async function planCode(cwd: string, fw: Supported): Promise<CodePlan> {
  const plan: CodePlan = { edits: [], manual: null, tagSite: null, keepTag: false };
  const files = [...(fw.targetExists ? [fw.target] : []), ...fw.scriptTagFiles];
  const contents = new Map<string, string>();
  for (const f of files) {
    const c = await readOpt(join(cwd, f));
    if (c !== null) contents.set(f, c);
  }

  const tagged = [...contents].filter(([, c]) => findScriptTag(c).found);
  if (tagged.length) {
    plan.tagSite = tagged.map(([, c]) => findScriptTag(c).siteId).find(Boolean) ?? null;
    const where = tagged.map(([f]) => f).join(", ");
    if (!(await ask(`Found a Satsu script tag in ${where}. Replace it with the <Satsu /> component?`))) {
      plan.keepTag = true;
      return plan;
    }
    for (const [f, c] of tagged) {
      const after = removeScriptTag(c);
      if (after === null) {
        plan.manual = `the script tag in ${f} couldn't be removed automatically; remove it by hand`;
        continue;
      }
      contents.set(f, after);
    }
  }

  const original = fw.targetExists ? (await readOpt(join(cwd, fw.target))) ?? "" : null;
  const current = fw.targetExists ? contents.get(fw.target) ?? original ?? "" : null;
  let target: string | null = current;
  if (current === null) {
    target =
      fw.kind === "sveltekit"
        ? newSvelteLayout(existsSync(join(cwd, "tsconfig.json")))
        : newPagesApp(fw.target.endsWith(".tsx") || fw.target.endsWith(".ts"));
  } else if (!hasSatsuComponent(current)) {
    const r = insertComponent(fw.kind, current);
    if (r.ok) target = r.code;
    else plan.manual = `${fw.target}: ${r.reason}`;
  }

  for (const [f, c] of contents) {
    if (f === fw.target) continue;
    const before = await readOpt(join(cwd, f));
    if (before !== c) plan.edits.push({ path: f, before, after: c });
  }
  if (target !== null && target !== original) plan.edits.unshift({ path: fw.target, before: original, after: target });
  return plan;
}

function addCommand(pm: PackageManager): string {
  return `${pm} ${pm === "npm" ? "install" : "add"} satsu-analytics`;
}

function manualSteps(fw: Supported, pm: PackageManager, site: string): string {
  const source = IMPORT_SOURCE[fw.kind];
  const wire =
    fw.kind === "nuxt"
      ? [`2. In ${fw.target}: add "${source}" to the modules array.`]
      : [
          `2. In ${fw.target}: import ${fw.kind === "astro" || fw.kind === "sveltekit" ? "Satsu" : "{ Satsu }"} from "${source}"`,
          `   and render <Satsu /> once, ${PLACEMENT[fw.kind]}.`,
        ];
  return [
    `1. ${addCommand(pm)}`,
    ...wire,
    `3. ${fw.envFile}: ${fw.envVar}=${site}`,
    `Docs: ${fw.docs}`,
  ].join("\n");
}

async function credentials(deps: InitDeps): Promise<Credentials> {
  const stored = await readCredentials(credentialsPath(deps.env));
  if (stored) return stored;
  p.log.step("Sign in to Satsu");
  const creds = await signIn(deps);
  if (!creds) throw new CliError("Not signed in. Run `npx satsu-analytics init` again to retry.");
  return creds;
}

/** Calls fn with the stored key; a revoked key gets one fresh sign-in. */
async function withKey<T>(deps: InitDeps, auth: { creds: Credentials }, fn: (c: Credentials) => Promise<T>): Promise<T> {
  try {
    return await fn(auth.creds);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
    p.log.warn("Your stored key is no longer valid. Sign in again.");
    await removeCredentials(credentialsPath(deps.env));
    auth.creds = await credentials(deps);
    return fn(auth.creds);
  }
}

const OTHER = "\0other";
const NONE = "\0none";

async function askDomain(cwd: string): Promise<string | undefined> {
  const found = suggestDomains(cwd);
  const choice = answer(
    await p.select<string>({
      message: "Production domain?",
      initialValue: found[0] ?? OTHER,
      options: [
        ...found.map((d) => ({ value: d, label: d, hint: "detected" })),
        { value: OTHER, label: "Enter a domain" },
        { value: NONE, label: "Not yet", hint: "set it later; the dashboard suggests it once traffic arrives" },
      ],
    }),
  );
  if (choice === NONE) return undefined;
  if (choice !== OTHER) return choice;
  const typed = answer(
    await p.text({
      message: "Domain",
      placeholder: "example.com",
      validate: (v) => (normalizeDomain(v ?? "") ? undefined : "Enter a domain like example.com"),
    }),
  );
  return normalizeDomain(typed) ?? undefined;
}

async function createSiteFlow(deps: InitDeps, auth: { creds: Credentials }): Promise<string> {
  const workspaces = await withKey(deps, auth, (c) => listWorkspaces(c.apiUrl, c.key));
  if (workspaces.length === 0) {
    throw new CliError(
      "You can't add sites to any workspace yet. Ask an owner or admin of your organization for access.",
    );
  }
  let workspace = workspaces[0]!;
  if (workspaces.length > 1) {
    const id = answer(
      await p.select<string>({
        message: "Workspace for the new site?",
        options: workspaces.map((w) => ({ value: w.id, label: w.name })),
      }),
    );
    workspace = workspaces.find((w) => w.id === id) ?? workspace;
  } else {
    p.log.info(`Workspace: ${workspace.name}`);
  }
  const domain = await askDomain(deps.cwd);
  const name = domain ?? projectName(deps.cwd);
  const site = await withKey(deps, auth, (c) =>
    createSite(c.apiUrl, c.key, { workspace: workspace.id, name, ...(domain ? { domain } : {}) }),
  );
  p.log.success(`Created site ${name} (${site}).`);
  return site;
}

async function waitForEvents(deps: InitDeps, creds: Credentials, site: string, pm: PackageManager): Promise<boolean> {
  const go = await ask(
    `Start your dev server (${pm} run dev) and open a page. Wait here for the test event?`,
  );
  if (!go) {
    p.log.info("Skipped. Your first real event after deploy shows up in the dashboard.");
    return false;
  }
  const spin = p.spinner();
  spin.start("Waiting for the test event (up to 3 minutes)");
  const deadline = deps.now() + INSTALL_CHECK_TIMEOUT_MS;
  while (deps.now() < deadline) {
    try {
      const r = await installCheck(creds.apiUrl, creds.key, site);
      if (r.devPingAt || r.firstEventAt) {
        spin.stop("✓ Satsu is receiving events");
        return true;
      }
    } catch (e) {
      // A new site may briefly 404 and the network may blip; auth and plan errors won't heal.
      if (e instanceof ApiError && (e.status === 401 || e.status === 402 || e.status === 403)) {
        spin.error("Install check failed");
        p.log.warn(e.message);
        return false;
      }
      if (!(e instanceof CliError)) throw e;
    }
    await deps.sleep(INSTALL_CHECK_INTERVAL_MS);
  }
  spin.error("No test event yet");
  p.log.info(
    "Check that the dev server runs on localhost and the page renders <Satsu />. Events after deploy show up in the dashboard either way.",
  );
  return false;
}

const OTHER_EDITOR = "other";

async function connectAgent(deps: InitDeps): Promise<void> {
  if (!(await ask("Connect your coding agent?"))) return;
  const detected = detectEditors(deps.cwd, deps.home);
  const choice = answer(
    await p.select<string>({
      message: "Which editor?",
      initialValue: detected[0] ?? OTHER_EDITOR,
      options: [
        ...EDITORS.map((e) => ({ value: e.id as string, label: e.label, ...(detected.includes(e.id) ? { hint: "detected" } : {}) })),
        { value: OTHER_EDITOR, label: "Other" },
      ],
    }),
  );
  if (choice === OTHER_EDITOR) {
    p.note(printedConfig(), "Add this MCP server to your editor's config");
    return;
  }
  const r = await writeMcpConfig(choice as Editor, deps.cwd, deps.home);
  if (r.ok) {
    p.log.success(r.changed ? `Added the Satsu MCP server to ${r.path}.` : `${r.path} already has the Satsu MCP server.`);
    p.log.info("The server uses your signed-in Satsu key from your user config; no key is written to the project.");
  } else {
    p.log.warn(`Couldn't update the config (${r.reason}). Add this yourself:`);
    p.note(printedConfig(), "MCP config");
  }
}

async function installPackage(deps: InitDeps, pm: PackageManager): Promise<void> {
  if (hasPackage(deps.cwd, "satsu-analytics")) return;
  if (!(await ask(`Install satsu-analytics with ${pm}?`))) {
    p.log.info(`Install it yourself: ${addCommand(pm)}`);
    return;
  }
  const [cmd, ...args] = addCommand(pm).split(" ");
  if (!(await deps.run(cmd!, args, deps.cwd))) p.log.warn(`Install failed. Run it yourself: ${addCommand(pm)}`);
}

async function unsupported(deps: InitDeps, label: string, docs: string): Promise<boolean> {
  p.log.warn(`${label} isn't set up automatically yet, so init won't write code here.`);
  let site = "YOUR_SITE_ID";
  if (await ask("Create a Satsu site and print its script tag?")) {
    site = await createSiteFlow(deps, { creds: await credentials(deps) });
  }
  p.note(`<script defer src="${TRACKER_SRC}"\n  data-site="${site}"></script>`, "Add this to the <head> of every page");
  p.outro(`Docs: ${docs}`);
  return true;
}

async function run(deps: InitDeps): Promise<boolean> {
  const cwd = deps.cwd;
  const fw = detectFramework(cwd);
  if (!fw.supported) return unsupported(deps, fw.label, fw.docs);
  p.log.info(`Detected ${fw.label}.`);

  const plan = await planCode(cwd, fw);
  if (plan.keepTag) {
    p.outro("Kept your script tag; nothing changed.");
    return true;
  }

  const envPath = join(cwd, fw.envFile);
  const envBefore = await readOpt(envPath);
  const existing = readEnvValue(envBefore, fw.envVar) ?? plan.tagSite;
  let site: string | null = null;
  if (existing && (await ask(`This project already uses Satsu site ${existing}. Keep using it?`))) {
    site = existing;
  }

  const auth = { creds: await credentials(deps) };
  site ??= await createSiteFlow(deps, auth);

  const envOld = readEnvValue(envBefore, fw.envVar);
  let envWrite = envOld !== site;
  if (envWrite && envOld) {
    envWrite = await ask(`${fw.envFile} already sets ${fw.envVar}=${envOld}. Replace it with ${site}?`, false);
  }
  const edits = [...plan.edits];
  if (envWrite) edits.push({ path: fw.envFile, before: envBefore, after: setEnvValue(envBefore, fw.envVar, site) });

  const pm = detectPackageManager(cwd);
  if (edits.length) {
    for (const e of edits) {
      p.log.message(`${e.before === null ? "new file" : "changes in"} ${e.path}\n${formatDiff(e.before, e.after)}`);
    }
    if (!(await ask("Write these changes?"))) {
      p.note(manualSteps(fw, pm, site), "Nothing written. To set it up by hand");
      p.outro("Done.");
      return true;
    }
    for (const e of edits) {
      const abs = join(cwd, e.path);
      if (!existsSync(dirname(abs))) await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, e.after);
    }
    p.log.success(`Updated ${edits.map((e) => e.path).join(", ")}.`);
  }
  if (plan.manual) {
    p.log.warn(`Couldn't place the component automatically (${plan.manual}).`);
    p.note(manualSteps(fw, pm, site), "Finish by hand");
  }

  await installPackage(deps, pm);
  await waitForEvents(deps, auth.creds, site, pm);
  await connectAgent(deps);
  p.outro(
    `Set ${fw.envVar}=${site} in your hosting provider's environment too; ${fw.envFile} stays on your machine.`,
  );
  return true;
}

export async function init(deps: InitDeps = realInitDeps): Promise<boolean> {
  p.intro("satsu-analytics init");
  try {
    return await run(deps);
  } catch (e) {
    if (e instanceof Cancelled) {
      p.cancel("Cancelled.");
      return false;
    }
    if (e instanceof CliError) {
      p.outro(e.message);
      return false;
    }
    throw e;
  }
}
