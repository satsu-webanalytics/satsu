import { inject, resolveMode, warnMissing } from "./core";

/** Framework-free entry used by the Vue, Astro, Svelte and Remix components. */
export function start(site: string | undefined, debug?: boolean): void {
  if (!site) return warnMissing();
  if (resolveMode(site, debug) === "live") inject(site);
}

/** Vite-style public variable; bundlers inline it at build time. */
export const viteSite = (): string | undefined =>
  (import.meta as { env?: Record<string, string> }).env?.VITE_SATSU_SITE;
