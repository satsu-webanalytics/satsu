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
