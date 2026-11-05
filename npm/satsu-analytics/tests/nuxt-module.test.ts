// @vitest-environment node
import { describe, expect, it } from "vitest";
import satsuModule from "../src/nuxt";

const nuxt = () => ({ options: { runtimeConfig: { public: {} as Record<string, unknown> }, plugins: [] as unknown[] } });

describe("nuxt module", () => {
  it("registers one client plugin and keeps the env-provided site", () => {
    const n = nuxt();
    n.options.runtimeConfig.public.satsuSite = "from_env";
    satsuModule({}, n);
    satsuModule({}, n);
    expect(n.options.runtimeConfig.public.satsuSite).toBe("from_env");
    expect(n.options.plugins).toHaveLength(1);
    expect(String(n.options.plugins[0])).toMatch(/nuxt-plugin\.client\.js$/);
  });

  it("an explicit module option wins", () => {
    const n = nuxt();
    satsuModule({ site: "opt" }, n);
    expect(n.options.runtimeConfig.public.satsuSite).toBe("opt");
  });
});
