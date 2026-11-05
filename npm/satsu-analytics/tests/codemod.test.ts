import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addImport,
  findScriptTag,
  hasSatsuComponent,
  insertComponent,
  newPagesApp,
  readEnvValue,
  removeScriptTag,
  setEnvValue,
} from "../src/cli/codemod";
import { detectFramework, normalizeDomain, suggestDomains } from "../src/cli/detect";
import { diffLines } from "../src/cli/diff";

const fixture = (name: string) => new URL(`./fixtures/${name}/`, import.meta.url).pathname;
const read = (name: string, file: string) => readFileSync(join(fixture(name), file), "utf8");

function copy(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `satsu-${name}-`));
  cpSync(fixture(name), dir, { recursive: true });
  return dir;
}

describe("detectFramework", () => {
  it("finds the App Router layout", () => {
    expect(detectFramework(fixture("next-app"))).toMatchObject({
      supported: true,
      kind: "next-app",
      target: "app/layout.tsx",
      envVar: "NEXT_PUBLIC_SATSU_SITE",
      envFile: ".env.local",
    });
  });

  it("finds the Pages Router _app and _document", () => {
    expect(detectFramework(fixture("next-pages"))).toMatchObject({
      kind: "next-pages",
      target: "pages/_app.tsx",
      targetExists: true,
      scriptTagFiles: ["pages/_document.tsx"],
    });
  });

  it("plans a new _app when a Pages project has none", () => {
    const dir = copy("next-pages");
    rmSync(join(dir, "pages/_app.tsx"));
    expect(detectFramework(dir)).toMatchObject({ kind: "next-pages", target: "pages/_app.jsx", targetExists: false });
  });

  it("finds Vite React's main entry and index.html", () => {
    expect(detectFramework(fixture("vite-react"))).toMatchObject({
      kind: "vite-react",
      target: "src/main.tsx",
      envVar: "VITE_SATSU_SITE",
      scriptTagFiles: ["index.html"],
    });
  });

  it("sends other frameworks and unknown projects to the docs", () => {
    const dir = mkdtempSync(join(tmpdir(), "satsu-x-"));
    expect(detectFramework(dir)).toEqual({ supported: false, label: "this folder", docs: "https://satsu.pro/docs/install" });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { nuxt: "^4.0.0", vue: "^3" } }));
    expect(detectFramework(dir)).toMatchObject({ supported: false, label: "Nuxt", docs: expect.stringContaining("vue-nuxt") });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { astro: "^5" } }));
    expect(detectFramework(dir)).toMatchObject({ supported: false, label: "Astro" });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { express: "^5" } }));
    expect(detectFramework(dir)).toMatchObject({ supported: false, label: "this project" });
  });
});

describe("domain suggestions", () => {
  it("normalizes like core-api's domain rule", () => {
    expect(normalizeDomain("https://Acme.dev/about?x=1")).toBe("acme.dev");
    expect(normalizeDomain("www.acme.dev:443")).toBe("www.acme.dev");
    expect(normalizeDomain("localhost")).toBeNull();
    expect(normalizeDomain("app.local")).toBeNull();
    expect(normalizeDomain("127.0.0.1")).toBeNull();
    expect(normalizeDomain("not a domain")).toBeNull();
  });

  it("reads homepage, vercel.json, netlify.toml and CNAME", () => {
    expect(suggestDomains(fixture("next-app"))).toEqual(["acme.dev"]);
    expect(suggestDomains(fixture("vite-react"))).toEqual(["shop.example.org"]);
    const dir = copy("next-pages");
    writeFileSync(join(dir, "vercel.json"), JSON.stringify({ alias: ["pages.acme.dev", "acme-pages.vercel.app"] }));
    writeFileSync(
      join(dir, "netlify.toml"),
      '[[redirects]]\n  from = "https://acme.netlify.app/*"\n  to = "https://www.acme.io/:splat"\n',
    );
    writeFileSync(join(dir, "CNAME"), "pages.acme.dev\n");
    expect(suggestDomains(dir)).toEqual(["pages.acme.dev", "acme-pages.vercel.app", "acme.netlify.app", "www.acme.io"]);
  });
});

describe("insertComponent", () => {
  it("App Router: renders <Satsu /> before </body> and imports it after the last import", () => {
    const r = insertComponent("next-app", read("next-app", "app/layout.tsx"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.code).toContain(`import "./globals.css";\nimport { Satsu } from "satsu-analytics/next";\n\nconst geistSans`);
    expect(r.code).toContain("        {children}\n        <Satsu />\n      </body>");
    expect(hasSatsuComponent(r.code)).toBe(true);
  });

  it("App Router: one-line body", () => {
    const r = insertComponent("next-app", `export default function L({ children }) {\n  return <html><body>{children}</body></html>;\n}\n`);
    expect(r.ok && r.code).toContain("<body>{children}<Satsu /></body>");
    expect(r.ok && r.code.startsWith(`import { Satsu } from "satsu-analytics/next";\n`)).toBe(true);
  });

  it("Pages Router: wraps a bare return in a fragment", () => {
    const r = insertComponent("next-pages", read("next-pages", "pages/_app.tsx"));
    expect(r.ok && r.code).toContain(
      "  return (\n    <>\n      <Component {...pageProps} />\n      <Satsu />\n    </>\n  );",
    );
    expect(r.ok && r.code).toContain(`import type { AppProps } from "next/app";\nimport { Satsu } from "satsu-analytics/next";`);
  });

  it("Pages Router: adds a sibling inside an existing wrapper and a fragment for a sole root", () => {
    const wrapped = `export default function App({ Component, pageProps }) {\n  return (\n    <Layout>\n      <Component {...pageProps} />\n    </Layout>\n  );\n}\n`;
    const r1 = insertComponent("next-pages", wrapped);
    expect(r1.ok && r1.code).toContain("      <Component {...pageProps} />\n      <Satsu />\n    </Layout>");
    const sole = `export default function App({ Component, pageProps }) {\n  return (\n    <Component {...pageProps} />\n  );\n}\n`;
    const r2 = insertComponent("next-pages", sole);
    expect(r2.ok && r2.code).toContain("  return (\n    <>\n      <Component {...pageProps} />\n      <Satsu />\n    </>\n  );");
  });

  it("Vite React: sibling of <App />, keeps single quotes and no semicolons", () => {
    const r = insertComponent("vite-react", read("vite-react", "src/main.tsx"));
    expect(r.ok && r.code).toContain("    <App />\n    <Satsu />\n  </StrictMode>");
    expect(r.ok && r.code).toContain("import App from './App.tsx'\nimport { Satsu } from 'satsu-analytics/react'\n");
  });

  it("Vite React: inline render gets an inline fragment", () => {
    const r = insertComponent("vite-react", `import App from "./App";\nroot.render(<App />);\n`);
    expect(r.ok && r.code).toContain("root.render(<><App /><Satsu /></>);");
  });

  it("keeps CRLF line endings", () => {
    const crlf = read("vite-react", "src/main.tsx").replace(/\n/g, "\r\n");
    const r = insertComponent("vite-react", crlf);
    expect(r.ok && r.code.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("fails instead of guessing when the anchor is missing or ambiguous", () => {
    expect(insertComponent("vite-react", "render(<Root />)")).toEqual({ ok: false, reason: "could not find <App />" });
    expect(insertComponent("next-app", "<body></body><body></body>")).toMatchObject({ ok: false });
  });

  it("adds the import after directives when there are no imports", () => {
    expect(addImport(`"use client";\n\nexport const x = 1;\n`, "satsu-analytics/react")).toBe(
      `"use client";\nimport { Satsu } from "satsu-analytics/react";\n\nexport const x = 1;\n`,
    );
  });

  it("new _app with and without types", () => {
    expect(newPagesApp(true)).toContain("{ Component, pageProps }: AppProps");
    expect(newPagesApp(false)).not.toContain("AppProps");
    expect(hasSatsuComponent(newPagesApp(false))).toBe(true);
  });
});

describe("script tags", () => {
  it("finds and removes a next/script Satsu tag and its unused import", () => {
    const doc = read("next-pages", "pages/_document.tsx");
    expect(findScriptTag(doc)).toEqual({ found: true, siteId: "site_legacy1" });
    const out = removeScriptTag(doc)!;
    expect(out).not.toContain("tracker.js");
    expect(out).not.toContain("next/script");
    expect(out).toContain("      <Head>\n      </Head>");
  });

  it("removes a plain script tag from index.html", () => {
    const html = read("vite-react", "index.html").replace(
      "</head>",
      `  <script defer src="https://track.satsu.pro/tracker.js" data-site="abc123"></script>\n  </head>`,
    );
    expect(findScriptTag(html).siteId).toBe("abc123");
    expect(removeScriptTag(html)).toBe(read("vite-react", "index.html"));
  });

  it("ignores other scripts", () => {
    const html = read("vite-react", "index.html");
    expect(findScriptTag(html).found).toBe(false);
    expect(removeScriptTag(html)).toBeNull();
  });
});

describe("env files", () => {
  it("reads, replaces and appends without touching other lines", () => {
    expect(readEnvValue(`A=1\nexport VITE_SATSU_SITE="abc"\n`, "VITE_SATSU_SITE")).toBe("abc");
    expect(readEnvValue("A=1\n", "VITE_SATSU_SITE")).toBeNull();
    expect(setEnvValue(null, "K", "v")).toBe("K=v\n");
    expect(setEnvValue("A=1", "K", "v")).toBe("A=1\nK=v\n");
    expect(setEnvValue("A=1\nK=old\nB=2\n", "K", "v")).toBe("A=1\nK=v\nB=2\n");
  });
});

describe("diffLines", () => {
  it("shows changed lines with context", () => {
    const a = "1\n2\n3\n4\n5\n6\n7\n8\n";
    const b = "1\n2\n3\n4\nnew\n5\n6\n7\n8\n";
    expect(diffLines(a, b, 1)).toEqual(["  4", "+ new", "  5"]);
    expect(diffLines(null, "x\n")).toEqual(["+ x"]);
    expect(diffLines("a\nb\nc\nd\ne\nf\ng\n", "A\nb\nc\nd\ne\nf\nG\n", 1)).toEqual([
      "- a",
      "+ A",
      "  b",
      "…",
      "  f",
      "- g",
      "+ G",
    ]);
  });
});
