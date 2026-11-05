import { useEffect } from "react";
import { inject, resolveMode, warnMissing } from "./core";

export interface SatsuProps {
  /** Site ID; falls back to VITE_SATSU_SITE. */
  site?: string;
  /** Log instead of loading the tracker. */
  debug?: boolean;
}

export function Satsu({ site, debug }: SatsuProps): null {
  const id = site || (import.meta as { env?: Record<string, string> }).env?.VITE_SATSU_SITE;
  useEffect(() => {
    if (!id) return warnMissing();
    if (resolveMode(id, debug) === "live") inject(id);
  }, [id, debug]);
  return null;
}
