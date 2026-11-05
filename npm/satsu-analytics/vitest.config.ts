import { compile } from "svelte/compiler";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      // Svelte components ship as source; compile them the way a consumer's build would.
      name: "svelte-fixture",
      transform(code, id) {
        if (!id.endsWith(".svelte")) return;
        const out = compile(code, { filename: id, generate: "client", dev: false });
        return { code: out.js.code, map: out.js.map as never };
      },
    },
  ],
  resolve: {
    conditions: ["browser"],
    alias: { "satsu-analytics/dom": new URL("./src/dom.ts", import.meta.url).pathname },
  },
});
