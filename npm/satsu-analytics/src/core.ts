// Framework-agnostic core shared by every entry. No storage, no cookies, no
// identifiers: it resolves the site, injects the hosted tracker once, and on
// local hosts sends a single dev ping instead (NPM_PACKAGE.md).

export const TRACKER_ORIGIN = "https://track.satsu.pro";
export const TRACKER_SRC = `${TRACKER_ORIGIN}/tracker.js`;

export type Props = Record<string, string | number | boolean>;
export type Mode = "live" | "local" | "debug";

export const state: { mode: Mode; queue: [string, Props | undefined][]; timer?: number } = {
  mode: "live",
  queue: [],
};

const LOCAL = /^(localhost|0\.0\.0\.0|127(\.\d{1,3}){3}|\[?::1\]?|.*\.local)$/i;

export const isLocalHost = (host: string): boolean => LOCAL.test(host);

let warned = false;
let pinged = false;

export const warnMissing = (): void => {
  if (warned || process.env.NODE_ENV === "production") return;
  warned = true;
  console.warn("[satsu] No site ID: pass `site` or set NEXT_PUBLIC_SATSU_SITE / VITE_SATSU_SITE.");
};

/** Sends the one dev ping per page load; the tracker is never injected here. */
export const devPing = (site: string): void => {
  if (pinged) return;
  pinged = true;
  const body = JSON.stringify({ s: site, t: "dv", h: location.origin + location.pathname });
  if (navigator.sendBeacon?.(`${TRACKER_ORIGIN}/e`, body)) return;
  fetch(`${TRACKER_ORIGIN}/e`, { method: "POST", body, keepalive: true }).catch(() => {});
};

/** Sets the mode for this page; returns it so callers know whether to load the tracker. */
export const resolveMode = (site: string, debug?: boolean): Mode => {
  const local = isLocalHost(location.hostname);
  state.mode = debug ? "debug" : local ? "local" : "live";
  if (debug) console.info("[satsu] debug: tracker not loaded", { site, local });
  else if (local) devPing(site);
  return state.mode;
};

/** Hands queued track() calls to the tracker once it is available. */
export const flush = (): void => {
  const fn = (window as unknown as { satsu?: (n: string, p?: Props) => void }).satsu;
  if (typeof fn !== "function") return;
  for (const [n, p] of state.queue.splice(0)) fn(n, p);
};

/** Injects the hosted tracker exactly once (plain React/Vite path). */
export const inject = (site: string, trackPaths?: string): void => {
  if (document.querySelector(`script[src="${TRACKER_SRC}"]`)) return;
  const s = document.createElement("script");
  s.defer = true;
  s.src = TRACKER_SRC;
  s.dataset.site = site;
  if (trackPaths) s.dataset.trackPaths = trackPaths;
  s.onload = flush;
  document.head.append(s);
};
