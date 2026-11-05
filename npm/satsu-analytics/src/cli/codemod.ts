import type { FrameworkKind } from "./detect";

// Targeted text inserts rather than an AST rewrite: layouts are the user's own
// code, so the change must stay minimal and keep their formatting. Anything
// the anchors don't cover fails and init falls back to printed manual steps.

export const IMPORT_SOURCE: Record<FrameworkKind, string> = {
  "next-app": "satsu-analytics/next",
  "next-pages": "satsu-analytics/next",
  "vite-react": "satsu-analytics/react",
  "vue-vite": "satsu-analytics/vue",
  nuxt: "satsu-analytics/nuxt",
  astro: "satsu-analytics/astro",
  sveltekit: "satsu-analytics/svelte",
  remix: "satsu-analytics/remix",
};

const ANCHOR: Record<FrameworkKind, RegExp> = {
  "next-app": /<\/body>/g,
  "next-pages": /<Component\s+\{\s*\.\.\.pageProps\s*\}\s*\/>/g,
  "vite-react": /<App\s*\/>/g,
  "vue-vite": /^<\/template>/gm,
  nuxt: /\bmodules\s*:\s*\[/g,
  astro: /<\/body>/g,
  sveltekit: /\{@render\s+children\s*\??\.?\(\s*\)\s*\}|<slot\s*\/>/g,
  remix: /<Outlet\s*\/>/g,
};

const ANCHOR_NAME: Record<FrameworkKind, string> = {
  "next-app": "</body>",
  "next-pages": "<Component {...pageProps} />",
  "vite-react": "<App />",
  "vue-vite": "the root <template>",
  nuxt: "modules: [",
  astro: "</body>",
  sveltekit: "{@render children()}",
  remix: "<Outlet />",
};

/** Where the component goes, for manual steps. */
export const PLACEMENT: Record<FrameworkKind, string> = {
  "next-app": "inside <body>, next to {children}",
  "next-pages": "next to <Component {...pageProps} />",
  "vite-react": "next to <App />",
  "vue-vite": "inside the root <template>, and import it in <script setup>",
  nuxt: "n/a",
  astro: "inside <body>",
  sveltekit: "next to {@render children()}",
  remix: "next to <Outlet /> in the root component",
};

export type InsertResult = { ok: true; code: string } | { ok: false; reason: string };

const COMPONENT = "<Satsu />";

export function hasSatsuComponent(code: string): boolean {
  if (/["']satsu-analytics\/nuxt["']/.test(code)) return true;
  return /from\s+["']satsu-analytics\/(next|react|remix|vue|astro|svelte)["']/.test(code) && /<Satsu\b/.test(code);
}

function withLf<T>(code: string, fn: (lf: string) => T & { code?: string }): T {
  const crlf = code.includes("\r\n");
  const out = fn(crlf ? code.replace(/\r\n/g, "\n") : code);
  if (crlf && typeof out.code === "string") out.code = out.code.replace(/\n/g, "\r\n");
  return out;
}

/** Adds `import { Satsu } from "<source>"` after the last top-level import. */
export function addImport(code: string, source: string): string {
  return withLf(code, (src) => ({ code: addImportLf(src, source) })).code;
}

/** `asDefault` for components that are a file's default export (.astro, .svelte). */
function addImportLf(code: string, source: string, asDefault = false, indent = ""): string {
  const lines = code.split("\n");
  let insertAt = 0;
  let inImport = false;
  let sample: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim();
    const ends = /["'][^"']+["']\s*;?\s*$/.test(t);
    if (inImport) {
      if (ends) {
        inImport = false;
        insertAt = i + 1;
        sample = t;
      }
      continue;
    }
    if (/^import\b/.test(t)) {
      if (ends) {
        insertAt = i + 1;
        sample = t;
      } else inImport = true;
      continue;
    }
    if (/^["']use [a-z]+["'];?$/.test(t)) {
      insertAt = Math.max(insertAt, i + 1);
      continue;
    }
    if (t === "" || t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) continue;
    break;
  }
  const q = sample && /'[^']+'\s*;?\s*$/.test(sample) ? "'" : '"';
  const semi = sample === null || sample.endsWith(";") ? ";" : "";
  const clause = asDefault ? "Satsu" : "{ Satsu }";
  lines.splice(insertAt, 0, `${indent}import ${clause} from ${q}${source}${q}${semi}`);
  return lines.join("\n");
}

const unitOf = (indent: string) => (/\t/.test(indent) ? "\t" : "  ");

/** Adds the import to the first matching `<script>` block, or creates one at the top. */
function addScriptImport(src: string, open: RegExp, source: string, asDefault: boolean, createWith: string): string {
  const m = open.exec(src);
  if (!m) return `${createWith}\n${src}`;
  const bodyStart = m.index + m[0].length;
  const close = src.indexOf("</script>", bodyStart);
  if (close === -1) return src;
  const raw = src.slice(bodyStart, close);
  const first = raw.split("\n").find((l) => l.trim() !== "");
  const indent = first ? /^[ \t]*/.exec(first)![0] : "  ";
  const body = addImportLf(raw, source, asDefault, indent);
  return src.slice(0, bodyStart) + body + src.slice(close);
}

function insertVue(src: string): InsertResult {
  const closes = [...src.matchAll(ANCHOR["vue-vite"])];
  if (closes.length !== 1) {
    return { ok: false, reason: closes.length ? "found more than one root <template>" : "could not find the root <template>" };
  }
  const scripts = [...src.matchAll(/^<script\b[^>]*\bsetup\b[^>]*>[ \t]*\n/gm)];
  if (scripts.length !== 1) return { ok: false, reason: "needs exactly one <script setup> block" };
  const close = closes[0]!;
  const before = src.slice(0, close.index!);
  const prevLine = before.trimEnd().split("\n").pop() ?? "";
  const indent = /^[ \t]*/.exec(prevLine)![0] || "  ";
  const withTag = `${before}${indent}${COMPONENT}\n${src.slice(close.index!)}`;
  const out = addScriptImport(withTag, /^<script\b[^>]*\bsetup\b[^>]*>[ \t]*\n/m, IMPORT_SOURCE["vue-vite"], false, "");
  return { ok: true, code: out };
}

function insertNuxt(src: string): InsertResult {
  const mod = "satsu-analytics/nuxt";
  const q = !src.includes("'") && src.includes('"') ? '"' : "'";
  const entry = `${q}${mod}${q}`;
  const mods = [...src.matchAll(ANCHOR.nuxt)];
  if (mods.length > 1) return { ok: false, reason: "found modules more than once" };
  if (mods.length === 1) {
    const at = mods[0]!.index! + mods[0]![0].length;
    const rest = src.slice(at);
    if (/^\s*\]/.test(rest)) return { ok: true, code: `${src.slice(0, at)}${entry}${src.slice(at)}` };
    const nl = /^[ \t]*\n([ \t]*)/.exec(rest);
    if (nl) {
      return { ok: true, code: `${src.slice(0, at)}\n${nl[1]}${entry},${src.slice(at).replace(/^[ \t]*/, "")}` };
    }
    return { ok: true, code: `${src.slice(0, at)}${entry}, ${src.slice(at)}` };
  }
  const defs = [...src.matchAll(/defineNuxtConfig\(\s*\{/g)];
  if (defs.length !== 1) {
    return { ok: false, reason: defs.length ? "found defineNuxtConfig more than once" : "could not find defineNuxtConfig({" };
  }
  const at = defs[0]!.index! + defs[0]![0].length;
  const rest = src.slice(at);
  const next = /^\s*\n([ \t]+)\S/.exec(rest);
  const unit = next ? next[1]! : "  ";
  if (/^\s*\}/.test(rest)) {
    return { ok: true, code: `${src.slice(0, at)}\n${unit}modules: [${entry}],\n${src.slice(at).replace(/^\s*/, "")}` };
  }
  return { ok: true, code: `${src.slice(0, at)}\n${unit}modules: [${entry}],${src.slice(at)}` };
}

function insertAstro(src: string): InsertResult {
  const bodies = [...src.matchAll(ANCHOR.astro)];
  if (bodies.length !== 1) {
    return { ok: false, reason: bodies.length ? "found </body> more than once" : "could not find </body>" };
  }
  const start = bodies[0]!.index!;
  const lineStart = src.lastIndexOf("\n", start - 1) + 1;
  const before = src.slice(lineStart, start);
  const indent = /^[ \t]*/.exec(before)![0];
  const out =
    before.trim() === ""
      ? `${src.slice(0, lineStart)}${indent}${unitOf(indent)}${COMPONENT}\n${src.slice(lineStart)}`
      : `${src.slice(0, start)}${COMPONENT}${src.slice(start)}`;
  const fm = /^---[ \t]*\n/.exec(out);
  if (!fm) return { ok: true, code: `---\nimport Satsu from "${IMPORT_SOURCE.astro}";\n---\n\n${out}` };
  const end = out.indexOf("\n---", fm[0].length - 1);
  if (end === -1) return { ok: false, reason: "unterminated frontmatter" };
  const body = addImportLf(out.slice(fm[0].length, end + 1), IMPORT_SOURCE.astro, true);
  return { ok: true, code: out.slice(0, fm[0].length) + body + out.slice(end + 1) };
}

function insertSvelte(src: string): InsertResult {
  const matches = [...src.matchAll(ANCHOR.sveltekit)];
  if (matches.length !== 1) {
    return { ok: false, reason: matches.length ? "found the children slot more than once" : "could not find {@render children()} or <slot />" };
  }
  const m = matches[0]!;
  const end = m.index! + m[0].length;
  const lineStart = src.lastIndexOf("\n", m.index! - 1) + 1;
  const before = src.slice(lineStart, m.index!);
  const out =
    before.trim() === ""
      ? `${src.slice(0, end)}\n${before}${COMPONENT}${src.slice(end)}`
      : `${src.slice(0, end)}${COMPONENT}${src.slice(end)}`;
  const instance = /^<script\b(?![^>]*(?:context\s*=\s*["']module["']|\bmodule\b))[^>]*>[ \t]*\n/m;
  const create = `<script>\n  import Satsu from "${IMPORT_SOURCE.sveltekit}";\n</script>\n`;
  return { ok: true, code: addScriptImport(out, instance, IMPORT_SOURCE.sveltekit, true, create) };
}

/** Renders `<Satsu />` once, next to the framework's anchor. */
export function insertComponent(kind: FrameworkKind, code: string): InsertResult {
  return withLf(code, (src): InsertResult => {
    if (kind === "vue-vite") return insertVue(src);
    if (kind === "nuxt") return insertNuxt(src);
    if (kind === "astro") return insertAstro(src);
    if (kind === "sveltekit") return insertSvelte(src);
    const anchor = new RegExp(ANCHOR[kind].source, "g");
    const matches = [...src.matchAll(anchor)];
    if (matches.length !== 1) {
      const what = ANCHOR_NAME[kind];
      return {
        ok: false,
        reason: matches.length ? `found ${what} more than once` : `could not find ${what}`,
      };
    }
    const m = matches[0]!;
    const start = m.index!;
    const end = start + m[0].length;
    const lineStart = src.lastIndexOf("\n", start - 1) + 1;
    const before = src.slice(lineStart, start);
    const indent = /^[ \t]*/.exec(before)![0];
    const unit = /\t/.test(indent) ? "\t" : "  ";
    let out: string;

    if (kind === "next-app") {
      out =
        before.trim() === ""
          ? `${src.slice(0, lineStart)}${indent}${unit}${COMPONENT}\n${src.slice(lineStart)}`
          : `${src.slice(0, start)}${COMPONENT}${src.slice(start)}`;
    } else if (before.trim() === "") {
      const prev = src.slice(0, lineStart).trimEnd();
      if (prev.endsWith("(")) {
        // The anchor is the sole root of `return (…)` or `render(…)`: a sibling needs a fragment.
        const frag = `${indent}<>\n${indent}${unit}${m[0]}\n${indent}${unit}${COMPONENT}\n${indent}</>`;
        out = `${src.slice(0, lineStart)}${frag}${src.slice(end)}`;
      } else {
        out = `${src.slice(0, end)}\n${indent}${COMPONENT}${src.slice(end)}`;
      }
    } else if (/(return|=>)\s*$/.test(before)) {
      const i1 = indent + unit;
      const i2 = i1 + unit;
      const frag = `(\n${i1}<>\n${i2}${m[0]}\n${i2}${COMPONENT}\n${i1}</>\n${indent})`;
      out = `${src.slice(0, start)}${frag}${src.slice(end)}`;
    } else {
      out = `${src.slice(0, start)}<>${m[0]}${COMPONENT}</>${src.slice(end)}`;
    }
    return { ok: true, code: addImportLf(out, IMPORT_SOURCE[kind]) };
  });
}

/** A fresh `+layout.svelte` for SvelteKit projects without one. */
export function newSvelteLayout(typescript: boolean): string {
  return `<script${typescript ? ' lang="ts"' : ""}>
  import Satsu from "satsu-analytics/svelte";

  let { children } = $props();
</script>

{@render children()}
<Satsu />
`;
}

/** A fresh `pages/_app` for Pages Router projects without one. */
export function newPagesApp(typescript: boolean): string {
  const typeImport = typescript ? `import type { AppProps } from "next/app";\n` : "";
  const sig = typescript ? "{ Component, pageProps }: AppProps" : "{ Component, pageProps }";
  return `${typeImport}import { Satsu } from "satsu-analytics/next";

export default function App(${sig}) {
  return (
    <>
      <Component {...pageProps} />
      <Satsu />
    </>
  );
}
`;
}

// One script element: quoted attribute values and simple `{…}` expressions.
const ELEMENT = /<(script|Script)\b(?:[^>"'{}]|"[^"]*"|'[^']*'|\{[^{}]*\})*?(?:\/>|>\s*<\/\1>)/g;

function isSatsuTag(el: string): boolean {
  return /satsu/i.test(el) && /tracker\.js|data-site/.test(el);
}

/** A hand-written Satsu tracker tag in this file, and the site it points at. */
export function findScriptTag(code: string): { found: boolean; siteId: string | null } {
  const hint = /satsu[^\n]*tracker\.js|tracker\.js[^\n]*satsu/i.test(code);
  const el = [...code.matchAll(ELEMENT)].map((m) => m[0]).find(isSatsuTag);
  const site = el && /data-site\s*=\s*\{?\s*["'`]([A-Za-z0-9_-]+)["'`]/.exec(el);
  return { found: hint || Boolean(el), siteId: site ? site[1]! : null };
}

/** Removes the Satsu tag (and a now-unused next/script import); null when it can't be isolated. */
export function removeScriptTag(code: string): string | null {
  const els = [...code.matchAll(ELEMENT)].filter((m) => isSatsuTag(m[0]));
  if (els.length === 0) return null;
  let out = code;
  for (const m of els.reverse()) {
    const start = m.index!;
    const end = start + m[0].length;
    const lineStart = out.lastIndexOf("\n", start - 1) + 1;
    const nl = out.indexOf("\n", end);
    const lineEnd = nl === -1 ? out.length : nl + 1;
    const ownLines = out.slice(lineStart, start).trim() === "" && out.slice(end, lineEnd).trim() === "";
    out = ownLines ? out.slice(0, lineStart) + out.slice(lineEnd) : out.slice(0, start) + out.slice(end);
  }
  if (!/<Script\b/.test(out)) {
    out = out.replace(/^import\s+Script\s+from\s+["']next\/script["'];?[ \t]*\r?\n/m, "");
  }
  return findScriptTag(out).found ? null : out;
}

const envLine = (key: string) => new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=(.*)$`, "m");

export function readEnvValue(content: string | null, key: string): string | null {
  const m = content && envLine(key).exec(content);
  if (!m) return null;
  return m[1]!.trim().replace(/^(["'])(.*)\1$/, "$2") || null;
}

/** Sets `key=value`, replacing an existing line for the key or appending one. */
export function setEnvValue(content: string | null, key: string, value: string): string {
  const line = `${key}=${value}`;
  if (!content) return `${line}\n`;
  const re = envLine(key);
  if (re.test(content)) return content.replace(re, line);
  return `${content}${content.endsWith("\n") ? "" : "\n"}${line}\n`;
}
