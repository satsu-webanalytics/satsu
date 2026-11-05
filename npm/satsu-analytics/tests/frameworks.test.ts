import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasSatsuComponent, insertComponent, newSvelteLayout } from "../src/cli/codemod";
import { detectFramework } from "../src/cli/detect";

const fixture = (name: string) => new URL(`./fixtures/${name}/`, import.meta.url).pathname;
const read = (name: string, file: string) => readFileSync(join(fixture(name), file), "utf8");

describe("detectFramework — more frameworks", () => {
  it.each([
    ["nuxt-app", "nuxt", "nuxt.config.ts", "NUXT_PUBLIC_SATSU_SITE", ".env"],
    ["vue-vite", "vue-vite", "src/App.vue", "VITE_SATSU_SITE", ".env.local"],
    ["astro-site", "astro", "src/layouts/Layout.astro", "PUBLIC_SATSU_SITE", ".env"],
    ["sveltekit-app", "sveltekit", "src/routes/+layout.svelte", "PUBLIC_SATSU_SITE", ".env"],
    ["remix-app", "remix", "app/root.tsx", "VITE_SATSU_SITE", ".env"],
  ])("%s", (name, kind, target, envVar, envFile) => {
    expect(detectFramework(fixture(name))).toMatchObject({ supported: true, kind, target, targetExists: true, envVar, envFile });
  });

  it("Vue and SvelteKit report their index.html / app.html for old script tags", () => {
    expect(detectFramework(fixture("vue-vite"))).toMatchObject({ scriptTagFiles: ["index.html"] });
  });
});

describe("insertComponent — Vue", () => {
  it("adds the import to <script setup> and the tag to the root template", () => {
    const r = insertComponent("vue-vite", read("vue-vite", "src/App.vue"));
    expect(r.ok && r.code).toContain('import { ref } from "vue";\nimport HelloWorld from "./components/HelloWorld.vue";\nimport { Satsu } from "satsu-analytics/vue";');
    expect(r.ok && r.code).toContain('</button>\n  </main>\n  <Satsu />\n</template>');
  });

  it("fails without <script setup>", () => {
    const r = insertComponent("vue-vite", "<template>\n  <div />\n</template>\n");
    expect(r.ok).toBe(false);
  });
});

describe("insertComponent — Nuxt", () => {
  it("appends to an existing modules array", () => {
    const r = insertComponent("nuxt", read("nuxt-app", "nuxt.config.ts"));
    expect(r.ok && r.code).toContain('modules: ["satsu-analytics/nuxt", "@nuxt/content", "@nuxt/image"]');
  });

  it("handles an empty and a multi-line modules array", () => {
    const empty = insertComponent("nuxt", "export default defineNuxtConfig({ modules: [] });");
    expect(empty.ok && empty.code).toBe("export default defineNuxtConfig({ modules: ['satsu-analytics/nuxt'] });");
    const multi = insertComponent("nuxt", "export default defineNuxtConfig({\n  modules: [\n    '@nuxt/image',\n  ],\n});\n");
    expect(multi.ok && multi.code).toContain("modules: [\n    'satsu-analytics/nuxt',\n    '@nuxt/image',\n  ]");
  });

  it("adds modules when the config has none", () => {
    const r = insertComponent("nuxt", "export default defineNuxtConfig({\n  devtools: { enabled: true },\n});\n");
    expect(r.ok && r.code).toBe("export default defineNuxtConfig({\n  modules: ['satsu-analytics/nuxt'],\n  devtools: { enabled: true },\n});\n");
    const bare = insertComponent("nuxt", "export default defineNuxtConfig({})\n");
    expect(bare.ok && bare.code).toBe("export default defineNuxtConfig({\n  modules: ['satsu-analytics/nuxt'],\n})\n");
  });

  it("fails on a config it can't read", () => {
    expect(insertComponent("nuxt", "export default config;").ok).toBe(false);
  });
});

describe("insertComponent — Astro", () => {
  it("imports in the frontmatter and renders before </body>", () => {
    const r = insertComponent("astro", read("astro-site", "src/layouts/Layout.astro"));
    expect(r.ok && r.code).toContain('import "../styles/global.css";\nimport Satsu from "satsu-analytics/astro";');
    expect(r.ok && r.code).toContain("    <slot />\n    <Satsu />\n  </body>");
  });

  it("creates frontmatter when the layout has none", () => {
    const r = insertComponent("astro", "<html>\n<body>\n<slot />\n</body>\n</html>\n");
    expect(r.ok && r.code).toMatch(/^---\nimport Satsu from "satsu-analytics\/astro";\n---\n\n<html>/);
  });
});

describe("insertComponent — SvelteKit", () => {
  it("renders after children and imports in the instance script", () => {
    const r = insertComponent("sveltekit", read("sveltekit-app", "src/routes/+layout.svelte"));
    expect(r.ok && r.code).toContain('import "../app.css";\n  import Satsu from "satsu-analytics/svelte";');
    expect(r.ok && r.code).toContain("{@render children()}\n<Satsu />");
  });

  it("supports <slot /> and creates a script block when absent", () => {
    const r = insertComponent("sveltekit", "<slot />\n");
    expect(r.ok && r.code).toBe('<script>\n  import Satsu from "satsu-analytics/svelte";\n</script>\n\n<slot />\n<Satsu />\n');
  });

  it("skips <script module> when picking the script to extend", () => {
    const r = insertComponent("sveltekit", '<script module>\n  export const x = 1;\n</script>\n\n<script>\n  let a = 1;\n</script>\n\n<slot />\n');
    expect(r.ok && r.code).toContain('<script>\n  import Satsu from "satsu-analytics/svelte";\n  let a = 1;');
  });

  it("new layout renders children and Satsu", () => {
    expect(newSvelteLayout(true)).toContain('<script lang="ts">');
    expect(newSvelteLayout(false)).toContain("{@render children()}\n<Satsu />");
  });
});

describe("insertComponent — Remix / React Router", () => {
  it("wraps a sole <Outlet /> in a fragment next to <Satsu />", () => {
    const r = insertComponent("remix", read("remix-app", "app/root.tsx"));
    expect(r.ok && r.code).toContain('import { Satsu } from "satsu-analytics/remix";');
    expect(r.ok && r.code).toContain("return (\n    <>\n      <Outlet />\n      <Satsu />\n    </>\n  );");
  });

  it("fails when <Outlet /> is missing", () => {
    expect(insertComponent("remix", "export default function App() { return null; }").ok).toBe(false);
  });
});

describe("hasSatsuComponent", () => {
  it("recognises every framework's wiring", () => {
    expect(hasSatsuComponent('modules: ["satsu-analytics/nuxt"]')).toBe(true);
    expect(hasSatsuComponent('import Satsu from "satsu-analytics/astro";\n<Satsu />')).toBe(true);
    expect(hasSatsuComponent('import Satsu from "satsu-analytics/svelte";\n<Satsu />')).toBe(true);
    expect(hasSatsuComponent('import { Satsu } from "satsu-analytics/remix";')).toBe(false);
  });
});
