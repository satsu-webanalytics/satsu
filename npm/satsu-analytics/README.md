<p align="center">
  <img src="https://satsu.pro/logo.svg" alt="Satsu logo" width="96" />
</p>

# satsu-analytics

Privacy-first analytics components for React, Next.js, Vue/Nuxt, Astro, SvelteKit and Remix. No cookies, no browser storage, no persistent visitor IDs; sessions are a daily-rotating hash.

Sessions are derived from a daily-rotating fingerprint that cannot be linked across days; raw IP addresses and user agents are never written to the analytics database and pass through our message queue only until they are processed, at most 24 hours; no cookies, no persistent visitor IDs.

## Quickstart

```sh
npx satsu-analytics init
```

`init` signs you in, picks one of your sites or creates one, shows a diff and wires the component into your project, installs the package, checks for a test event and can add the Satsu MCP server to your coding agent. Other commands: `login`, `logout`, `types`, `mcp`. To set it up by hand:

```sh
npm install satsu-analytics
```

```tsx
import { Satsu } from "satsu-analytics/next"; // or "satsu-analytics/react"

<Satsu site="YOUR_SITE_ID" />; // or set NEXT_PUBLIC_SATSU_SITE / VITE_SATSU_SITE

// Measure only some paths, e.g. the marketing pages in front of an app:
<Satsu site="YOUR_SITE_ID" trackPaths="/,/pricing,/docs,/blog" />;
```

```ts
import { track } from "satsu-analytics";
track("signup", { plan: "pro" });
```

On localhost the tracker is not loaded; one dev ping is sent per page load.

## Badges

Show a live uptime, accessibility or security badge that links to its public verification page. Get the slug from the badge section of your monitor or site settings.

```tsx
import { SatsuBadge } from "satsu-analytics/react";

<SatsuBadge slug="YOUR_BADGE_SLUG" type="uptime" theme="dark" />;
```

Props: `slug`, `type` (`uptime`, `a11y` or `security`), `theme` (`light`, `dark`), `style` (`flat`, `flat-square`), `brand` (`false` hides the wordmark where your plan allows it) and `className`. For Vue, Svelte, Astro or plain HTML use the helpers, which have no DOM or framework dependency:

```ts
import { badgeUrl, badgeVerifyUrl } from "satsu-analytics";

const img = badgeUrl({ slug, type: "a11y" }); // https://satsu.pro/badge/<slug>.svg?type=a11y
const link = badgeVerifyUrl({ slug, type: "a11y" }); // https://satsu.pro/b/<slug>?type=a11y
```

Both accept `origin` to point at another host. Render the image at its fixed size: `uptime` 232, `a11y` 218, `security` 196 px wide, 22 px high.
