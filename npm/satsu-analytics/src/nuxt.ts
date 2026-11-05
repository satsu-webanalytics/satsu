// Nuxt module: the site ID lives in runtimeConfig.public.satsuSite, which
// Nuxt overrides at runtime from NUXT_PUBLIC_SATSU_SITE. The client plugin
// (`install`) hands it to the shared core.
import { fileURLToPath } from "node:url";
export { install } from "./nuxt-install";

interface NuxtLike {
  options: { runtimeConfig: { public: Record<string, unknown> }; plugins: unknown[] };
}

export interface SatsuNuxtOptions {
  site?: string;
  debug?: boolean;
}

export default function satsuModule(options: SatsuNuxtOptions, nuxt: NuxtLike): void {
  const pub = nuxt.options.runtimeConfig.public;
  pub.satsuSite = options.site ?? pub.satsuSite ?? "";
  pub.satsuDebug = options.debug ?? false;
  const plugin = fileURLToPath(new URL("./nuxt-plugin.client.js", import.meta.url));
  if (!nuxt.options.plugins.includes(plugin)) nuxt.options.plugins.push(plugin);
}
