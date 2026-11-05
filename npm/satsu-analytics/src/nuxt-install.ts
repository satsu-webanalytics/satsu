import { start } from "./dom";

/** Client-only plugin body: call with `useRuntimeConfig().public`. */
export function install(config: { satsuSite?: unknown; satsuDebug?: unknown }): void {
  const site = typeof config.satsuSite === "string" && config.satsuSite ? config.satsuSite : undefined;
  start(site, config.satsuDebug === true);
}
