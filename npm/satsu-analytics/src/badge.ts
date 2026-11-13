// Framework-agnostic, no DOM. Sizes mirror the renderer in apps/web/lib/badge/render.ts.

export type BadgeType = "uptime" | "a11y" | "security";

export interface BadgeOptions {
  /** Badge slug (monitor share slug for uptime, site badge slug otherwise). */
  slug: string;
  type: BadgeType;
  theme?: "light" | "dark";
  style?: "flat" | "flat-square";
  /** `false` hides the Satsu wordmark where the plan allows it. */
  brand?: boolean;
  /** Web origin serving badges; defaults to https://satsu.pro. */
  origin?: string;
}

export const BADGE_ORIGIN = "https://satsu.pro";
export const BADGE_HEIGHT = 22;
export const BADGE_WIDTH: Record<BadgeType, number> = { uptime: 232, a11y: 218, security: 196 };

const base = (origin?: string) => (origin ?? BADGE_ORIGIN).replace(/\/+$/, "");

export function badgeUrl({ slug, type, theme, style, brand, origin }: BadgeOptions): string {
  const q = new URLSearchParams({ type });
  if (theme) q.set("theme", theme);
  if (style) q.set("style", style);
  if (brand === false) q.set("brand", "0");
  return `${base(origin)}/badge/${encodeURIComponent(slug)}.svg?${q}`;
}

export function badgeVerifyUrl({ slug, type, origin }: Pick<BadgeOptions, "slug" | "type" | "origin">): string {
  return `${base(origin)}/b/${encodeURIComponent(slug)}?type=${type}`;
}
