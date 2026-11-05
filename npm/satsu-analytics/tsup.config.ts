import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "tsup";
import pkg from "./package.json" with { type: "json" };

const entry = {
  index: "src/index.ts",
  react: "src/react.tsx",
  next: "src/next.tsx",
  vue: "src/vue.ts",
  nuxt: "src/nuxt.ts",
  "nuxt-plugin.client": "src/nuxt-plugin.ts",
  remix: "src/remix.tsx",
  dom: "src/dom.ts",
  cli: "src/cli.ts",
};

export default defineConfig({
  entry,
  format: ["esm"],
  dts: {
    entry: {
      index: "src/index.ts",
      react: "src/react.tsx",
      next: "src/next.tsx",
      vue: "src/vue.ts",
      nuxt: "src/nuxt.ts",
      remix: "src/remix.tsx",
      dom: "src/dom.ts",
    },
  },
  define: { "process.env.SATSU_CLI_VERSION": JSON.stringify(pkg.version) },
  clean: true,
  minify: true,
  treeshake: true,
  splitting: true,
  external: ["react", "react/jsx-runtime", "next", "next/script", "vue", "satsu-analytics/dom"],
  // esbuild drops module directives when bundling; only the component entries
  // are client modules, `track` must stay importable from server code.
  onSuccess: async () => {
    for (const f of ["dist/react.js", "dist/next.js", "dist/remix.js"]) {
      writeFileSync(f, `"use client";${readFileSync(f, "utf8")}`);
    }
    // Astro and Svelte compile these in the consumer's build; they ship as source.
    for (const dir of ["astro/Satsu.astro", "svelte/Satsu.svelte"]) {
      mkdirSync(`dist/${dir.split("/")[0]}`, { recursive: true });
      copyFileSync(`src/${dir}`, `dist/${dir}`);
    }
  },
});
