import { useEffect } from "react";
import { start, viteSite } from "./dom";
import type { SatsuProps } from "./react";

/** React Router / Remix (Vite): render once in root.tsx. */
export function Satsu({ site, debug }: SatsuProps): null {
  const id = site || viteSite();
  useEffect(() => start(id, debug), [id, debug]);
  return null;
}
