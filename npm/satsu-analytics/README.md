# satsu-analytics

Privacy-first analytics for React and Next.js. No cookies, no storage, no IDs.

Sessions are derived from a daily-rotating fingerprint that cannot be linked across days; raw IP addresses and user agents are never stored, no cookies, no persistent visitor IDs.

## Quickstart

```sh
npx satsu-analytics init
```

`init` signs you in, creates the site and wires the component into your project. To set it up by hand:

```sh
npm install satsu-analytics
```

```tsx
import { Satsu } from "satsu-analytics/next"; // or "satsu-analytics/react"

<Satsu site="YOUR_SITE_ID" />; // or set NEXT_PUBLIC_SATSU_SITE / VITE_SATSU_SITE
```

```ts
import { track } from "satsu-analytics";
track("signup", { plan: "pro" });
```

On localhost the tracker is not loaded; one dev ping is sent per page load.
