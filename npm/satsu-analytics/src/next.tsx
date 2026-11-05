import Script from "next/script";
import { useEffect, useState } from "react";
import { flush, resolveMode, TRACKER_SRC, warnMissing } from "./core";
import type { SatsuProps } from "./react";

/** Next.js: the tracker goes through next/script; local hosts only ping. */
export function Satsu({ site, debug }: SatsuProps) {
  const id = site || process.env.NEXT_PUBLIC_SATSU_SITE;
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!id) return warnMissing();
    setLive(resolveMode(id, debug) === "live");
  }, [id, debug]);
  if (!id || !live) return null;
  return <Script src={TRACKER_SRC} data-site={id} strategy="afterInteractive" onLoad={flush} />;
}
