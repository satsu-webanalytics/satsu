import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

export type FrameworkKind =
  | "next-app"
  | "next-pages"
  | "vite-react"
  | "vue-vite"
  | "nuxt"
  | "astro"
  | "sveltekit"
  | "remix";

export interface Supported {
  supported: true;
  kind: FrameworkKind;
  label: string;
  envVar: string;
  envFile: string;
  /** File the component goes into, relative to the project root. */
  target: string;
  /** Whether `target` exists yet (Pages Router projects may lack `_app`). */
  targetExists: boolean;
  /** Further files that may hold a hand-written Satsu script tag. */
  scriptTagFiles: string[];
  docs: string;
}

export interface Unsupported {
  supported: false;
  label: string;
  docs: string;
}

export type Framework = Supported | Unsupported;

export const DOCS_BASE = "https://satsu.pro/docs";
const SOURCE_EXT = ["tsx", "jsx", "ts", "js"];

export type PackageJson = {
  name?: string;
  homepage?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export function readPackageJson(cwd: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

function hasDep(pkg: PackageJson | null, name: string): boolean {
  return Boolean(pkg?.dependencies?.[name] ?? pkg?.devDependencies?.[name]);
}

function firstExisting(cwd: string, stems: string[], exts = SOURCE_EXT): string | null {
  for (const stem of stems) {
    for (const ext of exts) {
      if (existsSync(join(cwd, `${stem}.${ext}`))) return `${stem}.${ext}`;
    }
  }
  return null;
}

function usesTypeScript(cwd: string): boolean {
  return existsSync(join(cwd, "tsconfig.json"));
}

/** Frameworks without a codemod get their docs page. */
const OTHERS: Array<[dep: string, label: string, page: string]> = [["vue", "Vue", "vue-nuxt"]];

function firstAstroLayout(cwd: string): string | null {
  const named = firstExisting(
    cwd,
    ["Layout", "BaseLayout", "MainLayout", "Base", "Default"].map((n) => `src/layouts/${n}`),
    ["astro"],
  );
  if (named) return named;
  try {
    const all = readdirSync(join(cwd, "src/layouts")).filter((f) => f.endsWith(".astro"));
    return all.length === 1 ? `src/layouts/${all[0]}` : null;
  } catch {
    return null;
  }
}

export function detectFramework(cwd: string): Framework {
  const pkg = readPackageJson(cwd);
  const ts = usesTypeScript(cwd);

  if (hasDep(pkg, "next")) {
    const base = {
      supported: true as const,
      envVar: "NEXT_PUBLIC_SATSU_SITE",
      envFile: ".env.local",
      docs: `${DOCS_BASE}/frameworks/nextjs`,
    };
    const layout = firstExisting(cwd, ["app/layout", "src/app/layout"]);
    if (layout) {
      return { ...base, kind: "next-app", label: "Next.js (App Router)", target: layout, targetExists: true, scriptTagFiles: [] };
    }
    const pagesDir = ["pages", "src/pages"].find((d) => existsSync(join(cwd, d)));
    if (pagesDir) {
      const app = firstExisting(cwd, [`${pagesDir}/_app`]);
      const doc = firstExisting(cwd, [`${pagesDir}/_document`]);
      return {
        ...base,
        kind: "next-pages",
        label: "Next.js (Pages Router)",
        target: app ?? `${pagesDir}/_app.${ts ? "tsx" : "jsx"}`,
        targetExists: Boolean(app),
        scriptTagFiles: doc ? [doc] : [],
      };
    }
    return { supported: false, label: "Next.js", docs: base.docs };
  }

  if (hasDep(pkg, "nuxt")) {
    const docs = `${DOCS_BASE}/frameworks/vue-nuxt`;
    const config = firstExisting(cwd, ["nuxt.config"], ["ts", "js", "mjs", "mts"]);
    if (!config) return { supported: false, label: "Nuxt", docs };
    return {
      supported: true,
      kind: "nuxt",
      label: "Nuxt",
      envVar: "NUXT_PUBLIC_SATSU_SITE",
      envFile: ".env",
      docs,
      target: config,
      targetExists: true,
      scriptTagFiles: [],
    };
  }

  if (hasDep(pkg, "astro")) {
    const docs = `${DOCS_BASE}/frameworks/astro`;
    const layout = firstAstroLayout(cwd);
    if (!layout) return { supported: false, label: "Astro", docs };
    return {
      supported: true,
      kind: "astro",
      label: "Astro",
      envVar: "PUBLIC_SATSU_SITE",
      envFile: ".env",
      docs,
      target: layout,
      targetExists: true,
      scriptTagFiles: [],
    };
  }

  if (hasDep(pkg, "@sveltejs/kit")) {
    const docs = `${DOCS_BASE}/frameworks/sveltekit`;
    if (!existsSync(join(cwd, "src/routes"))) return { supported: false, label: "SvelteKit", docs };
    const target = "src/routes/+layout.svelte";
    return {
      supported: true,
      kind: "sveltekit",
      label: "SvelteKit",
      envVar: "PUBLIC_SATSU_SITE",
      envFile: ".env",
      docs,
      target,
      targetExists: existsSync(join(cwd, target)),
      scriptTagFiles: existsSync(join(cwd, "src/app.html")) ? ["src/app.html"] : [],
    };
  }

  if (hasDep(pkg, "@remix-run/react") || hasDep(pkg, "@react-router/dev")) {
    const label = hasDep(pkg, "@react-router/dev") ? "React Router" : "Remix";
    const docs = `${DOCS_BASE}/frameworks/remix`;
    const root = firstExisting(cwd, ["app/root"]);
    if (!root) return { supported: false, label, docs };
    return {
      supported: true,
      kind: "remix",
      label,
      envVar: "VITE_SATSU_SITE",
      envFile: ".env",
      docs,
      target: root,
      targetExists: true,
      scriptTagFiles: [],
    };
  }

  if (hasDep(pkg, "vite") && hasDep(pkg, "react")) {
    const main = firstExisting(cwd, ["src/main", "src/index"]);
    const docs = `${DOCS_BASE}/frameworks/react`;
    if (!main) return { supported: false, label: "React (Vite)", docs };
    return {
      supported: true,
      kind: "vite-react",
      label: "React (Vite)",
      envVar: "VITE_SATSU_SITE",
      envFile: ".env.local",
      docs,
      target: main,
      targetExists: true,
      scriptTagFiles: existsSync(join(cwd, "index.html")) ? ["index.html"] : [],
    };
  }

  if (hasDep(pkg, "vue") && hasDep(pkg, "vite") && existsSync(join(cwd, "src/App.vue"))) {
    return {
      supported: true,
      kind: "vue-vite",
      label: "Vue (Vite)",
      envVar: "VITE_SATSU_SITE",
      envFile: ".env.local",
      docs: `${DOCS_BASE}/frameworks/vue-nuxt`,
      target: "src/App.vue",
      targetExists: true,
      scriptTagFiles: existsSync(join(cwd, "index.html")) ? ["index.html"] : [],
    };
  }

  for (const [dep, label, page] of OTHERS) {
    if (hasDep(pkg, dep)) return { supported: false, label, docs: `${DOCS_BASE}/frameworks/${page}` };
  }

  return { supported: false, label: pkg ? "this project" : "this folder", docs: `${DOCS_BASE}/install` };
}

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Mirrors core-api's domain rule so the CLI rejects what the API would. */
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split(/[/?#]/)[0]!.replace(/:\d+$/, "").replace(/\.$/, "");
  if (s.length < 3 || s.length > 253 || !HOST_RE.test(s)) return null;
  if (s === "localhost" || s.endsWith(".local") || s.endsWith(".localhost") || /^\d+(\.\d+){3}$/.test(s)) {
    return null;
  }
  return s;
}

function readText(cwd: string, rel: string): string | null {
  try {
    return readFileSync(join(cwd, rel), "utf8");
  } catch {
    return null;
  }
}

/** Domain candidates from package.json `homepage`, Vercel/Netlify config and `CNAME`. */
export function suggestDomains(cwd: string): string[] {
  const raw: string[] = [];
  const pkg = readPackageJson(cwd);
  if (typeof pkg?.homepage === "string") raw.push(pkg.homepage);

  const vercel = readText(cwd, "vercel.json");
  if (vercel) {
    try {
      const v = JSON.parse(vercel);
      const alias = Array.isArray(v.alias) ? v.alias : typeof v.alias === "string" ? [v.alias] : [];
      raw.push(...alias.filter((a: unknown): a is string => typeof a === "string"));
    } catch {
      // Malformed vercel.json: no suggestion from it.
    }
  }

  const netlify = readText(cwd, "netlify.toml");
  if (netlify) {
    for (const m of netlify.matchAll(/https?:\/\/([^/"'\s*]+)/g)) raw.push(m[1]!);
  }

  for (const rel of ["CNAME", "public/CNAME", "static/CNAME"]) {
    const c = readText(cwd, rel);
    if (c) raw.push(c.split(/\r?\n/)[0] ?? "");
  }

  const out: string[] = [];
  for (const r of raw) {
    const d = normalizeDomain(r);
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

export function projectName(cwd: string): string {
  const name = readPackageJson(cwd)?.name;
  const base = typeof name === "string" && name ? name.replace(/^@[^/]+\//, "") : basename(cwd);
  return base.slice(0, 100) || "My site";
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) return "bun";
  return "npm";
}

export function hasPackage(cwd: string, name: string): boolean {
  return hasDep(readPackageJson(cwd), name);
}
