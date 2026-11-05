// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { resolveMode, state, warnMissing, TRACKER_SRC } from "../src/core";
import { Satsu } from "../src/react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const at = (hostname: string) =>
  vi.stubGlobal("location", { hostname, origin: `http://${hostname}`, pathname: "/", href: `http://${hostname}/` });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.head.innerHTML = "";
});

describe("resolveMode", () => {
  it("local host: one dv ping, no matter how often it is called", () => {
    at("localhost");
    const beacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { sendBeacon: beacon });
    expect(resolveMode("s1")).toBe("local");
    resolveMode("s1");
    expect(beacon).toHaveBeenCalledTimes(1);
    const body = JSON.parse((beacon.mock.calls[0] as unknown as [string, string])[1]);
    expect(body).toEqual({ s: "s1", t: "dv", h: "http://localhost/" });
  });

  it("debug mode logs and sends nothing", () => {
    at("example.com");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(resolveMode("s1", true)).toBe("debug");
    expect(info).toHaveBeenCalled();
  });

  it("public host is live", () => {
    at("example.com");
    expect(resolveMode("s1")).toBe("live");
    expect(state.mode).toBe("live");
  });
});

describe("warnMissing", () => {
  it("warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnMissing();
    warnMissing();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("<Satsu> (react)", () => {
  const mount = async (props: Parameters<typeof Satsu>[0]) => {
    const el = document.createElement("div");
    await act(async () => createRoot(el).render(createElement(Satsu, props)));
    return el;
  };

  it("injects the tracker once on a public host and renders nothing", async () => {
    at("example.com");
    const el = await mount({ site: "s1" });
    await mount({ site: "s1" });
    expect(el.innerHTML).toBe("");
    expect(document.querySelectorAll(`script[src="${TRACKER_SRC}"]`)).toHaveLength(1);
  });

  it("does not inject on a local host", async () => {
    at("127.0.0.1");
    vi.stubGlobal("navigator", { sendBeacon: () => true });
    await mount({ site: "s1" });
    expect(document.querySelector("script")).toBeNull();
  });

  it("renders nothing without a site", async () => {
    at("example.com");
    const el = await mount({});
    expect(el.innerHTML).toBe("");
    expect(document.querySelector("script")).toBeNull();
  });
});
