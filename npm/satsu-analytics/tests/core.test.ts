// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isLocalHost, inject, state, TRACKER_SRC } from "../src/core";
import { track } from "../src/index";

describe("isLocalHost", () => {
  it.each(["localhost", "127.0.0.1", "127.5.6.7", "::1", "[::1]", "app.local", "0.0.0.0"])(
    "%s is local",
    (h) => expect(isLocalHost(h)).toBe(true),
  );
  it.each(["satsu.pro", "example.com", "localhost.example.com", "128.0.0.1", "local.dev"])(
    "%s is not local",
    (h) => expect(isLocalHost(h)).toBe(false),
  );
});

describe("inject", () => {
  it("adds the tracker script once, without storage", () => {
    inject("site_1");
    inject("site_1");
    const tags = document.querySelectorAll(`script[src="${TRACKER_SRC}"]`);
    expect(tags).toHaveLength(1);
    expect((tags[0] as HTMLScriptElement).dataset.site).toBe("site_1");
    expect(document.cookie).toBe("");
    expect(localStorage.length).toBe(0);
  });

  it("passes trackPaths on as data-track-paths, and omits it by default", () => {
    document.querySelectorAll(`script[src="${TRACKER_SRC}"]`).forEach((s) => s.remove());
    inject("site_1", "/,/pricing");
    const tag = document.querySelector(`script[src="${TRACKER_SRC}"]`) as HTMLScriptElement;
    expect(tag.dataset.trackPaths).toBe("/,/pricing");
    tag.remove();
    inject("site_1");
    expect((document.querySelector(`script[src="${TRACKER_SRC}"]`) as HTMLScriptElement).hasAttribute("data-track-paths")).toBe(false);
  });
});

describe("track", () => {
  beforeEach(() => {
    state.mode = "live";
    state.queue.length = 0;
    delete (window as { satsu?: unknown }).satsu;
  });

  it("queues until window.satsu exists, then flushes", async () => {
    vi.useFakeTimers();
    track("signup", { plan: "pro" });
    expect(state.queue).toHaveLength(1);
    const fn = vi.fn();
    (window as unknown as { satsu: typeof fn }).satsu = fn;
    vi.advanceTimersByTime(250);
    expect(fn).toHaveBeenCalledWith("signup", { plan: "pro" });
    expect(state.queue).toHaveLength(0);
    vi.useRealTimers();
  });

  it("calls straight through when the tracker is loaded", () => {
    const fn = vi.fn();
    (window as unknown as { satsu: typeof fn }).satsu = fn;
    track("newsletter");
    expect(fn).toHaveBeenCalledWith("newsletter", undefined);
  });

  it("logs instead of sending in local/debug mode", () => {
    state.mode = "local";
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    track("newsletter");
    expect(info).toHaveBeenCalled();
    expect(state.queue).toHaveLength(0);
  });
});
