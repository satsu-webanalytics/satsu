import { useEffect } from "react";
import { inject, resolveMode, warnMissing } from "./core";
import { badgeUrl, badgeVerifyUrl, BADGE_HEIGHT, BADGE_WIDTH, type BadgeOptions, type BadgeType } from "./badge";

export interface SatsuProps {
  /** Site ID; falls back to VITE_SATSU_SITE. */
  site?: string;
  /** Log instead of loading the tracker. */
  debug?: boolean;
  /**
   * Comma-separated path prefixes to measure, e.g. "/,/pricing,/docs";
   * pages outside them (an app behind a login) send nothing. Default: all.
   */
  trackPaths?: string;
}

export function Satsu({ site, debug, trackPaths }: SatsuProps): null {
  const id = site || (import.meta as { env?: Record<string, string> }).env?.VITE_SATSU_SITE;
  useEffect(() => {
    if (!id) return warnMissing();
    if (resolveMode(id, debug) === "live") inject(id, trackPaths);
  }, [id, debug, trackPaths]);
  return null;
}

export interface SatsuBadgeProps extends Omit<BadgeOptions, "origin"> {
  className?: string;
  /** Web origin serving badges; defaults to https://satsu.pro. */
  origin?: string;
}

const ALT: Record<BadgeType, string> = {
  uptime: "Uptime monitored by Satsu",
  a11y: "WCAG 2.1 AA accessibility verified by Satsu",
  security: "Security checked by Satsu",
};

/** Live badge linking to its public verification page. */
export function SatsuBadge({ className, ...o }: SatsuBadgeProps) {
  return (
    <a href={badgeVerifyUrl(o)} target="_blank" rel="noopener" className={className}>
      <img src={badgeUrl(o)} alt={ALT[o.type]} width={BADGE_WIDTH[o.type]} height={BADGE_HEIGHT} loading="lazy" />
    </a>
  );
}
