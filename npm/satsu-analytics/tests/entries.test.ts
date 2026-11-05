// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createApp, h } from "vue";
import { mount } from "svelte";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SRC = "https://track.satsu.pro/tracker.js";
const at = (hostname: string) =>
  vi.stubGlobal("location", { hostname, origin: `http://${hostname}`, pathname: "/", href: `http://${hostname}/` });
const scripts = () => document.head.querySelectorAll(`script[src="${SRC}"]`);

let beacon: ReturnType<typeof vi.fn>;
beforeEach(() => {
  // core keeps once-per-page flags at module level; every test is a fresh page.
  vi.resetModules();
  beacon = vi.fn(() => true);
  vi.stubGlobal("navigator", { sendBeacon: beacon });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

// Every entry renders its component twice: still one script, one ping.
const entries: Record<string, (site: string) => Promise<void>> = {
  vue: async (site) => {
    const { Satsu } = await import("../src/vue");
    createApp({ render: () => [h(Satsu, { site }), h(Satsu, { site })] }).mount(document.createElement("div"));
  },
  nuxt: async (site) => {
    const { install } = await import("../src/nuxt");
    install({ satsuSite: site });
    install({ satsuSite: site });
  },
  remix: async (site) => {
    const { Satsu } = await import("../src/remix");
    const root = createRoot(document.createElement("div"));
    act(() => root.render(createElement("div", null, createElement(Satsu, { site }), createElement(Satsu, { site }))));
  },
  svelte: async (site) => {
    const { default: Satsu } = await import("../src/svelte/Satsu.svelte");
    mount(Satsu, { target: document.body, props: { site } });
    mount(Satsu, { target: document.body, props: { site } });
  },
  astro: async (site) => {
    // Mirrors the component's client script: marker element -> start().
    const { start } = await import("../src/dom");
    document.body.innerHTML = `<div hidden data-satsu-site="${site}"></div>`;
    const el = document.querySelector<HTMLElement>("[data-satsu-site]");
    start(el?.dataset.satsuSite, el?.dataset.satsuDebug === "1");
    start(el?.dataset.satsuSite, el?.dataset.satsuDebug === "1");
  },
};

describe.each(Object.entries(entries))("%s entry", (_name, run) => {
  it("injects the tracker exactly once on a public host", async () => {
    at("example.com");
    await run("site_1");
    expect(scripts()).toHaveLength(1);
    expect((scripts()[0] as HTMLScriptElement).dataset.site).toBe("site_1");
    expect(beacon).not.toHaveBeenCalled();
  });

  it("on localhost sends one dev ping and no script", async () => {
    at("localhost");
    await run("site_1");
    expect(scripts()).toHaveLength(0);
    expect(beacon).toHaveBeenCalledTimes(1);
  });
});

describe("astro component", () => {
  const src = readFileSync("src/astro/Satsu.astro", "utf8");

  it("reads PUBLIC_SATSU_SITE and ships one client script via the shared core", () => {
    expect(src).toContain("import.meta.env.PUBLIC_SATSU_SITE");
    expect(src.match(/<script>/g)).toHaveLength(1);
    expect(src).toContain('from "satsu-analytics/dom"');
  });
});

describe("missing site", () => {
  it("injects nothing", async () => {
    at("example.com");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { start } = await import("../src/dom");
    start(undefined);
    expect(scripts()).toHaveLength(0);
  });
});

