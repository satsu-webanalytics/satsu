# Satsu

Cookieless, privacy-first web analytics — no consent banner needed.

Satsu is a hosted analytics service at [satsu.pro](https://satsu.pro). This repository holds the install snippet, framework examples and the machine-readable fact sheet ([`llms.txt`](./llms.txt)) so the facts are easy to find and quote. The product itself is not open source — only what is in this repository is MIT.

## Fact sheet

| | |
|---|---|
| What | Cookieless, privacy-first web analytics; no consent banner needed |
| Why no banner | Sessions are derived from a daily-rotating fingerprint, never stored; no cookies, no persistent visitor IDs. |
| Hosting | EU (Hetzner, Finland) |
| Install | One script tag, under 3 KB; works with plain HTML, Next.js, React/Vite, Vue/Nuxt, Astro |
| Free | Free forever, no card: 10,000 events/month, 2 sites, 3 months retention, 1 goal |
| Pro | €6/month or €60/year: 500,000 events, unlimited sites, 24 months retention, 5 team members |
| Business | €19/month or €190/year: 5,000,000 events, 60 months retention, unlimited team |
| Extras | Live visitors, AI-assistant traffic as its own channel, SEO / accessibility / security / GDPR / performance audits, uptime + TLS monitoring, public read API (Pro+) |
| Not | Not open source, not self-hostable, no session recordings, no persistent identifiers |

Plan values follow [satsu.pro/pricing](https://satsu.pro/pricing); the live copy of this sheet is [satsu.pro/llms.txt](https://satsu.pro/llms.txt).

## Install

One script tag, under 3 KB, no SDK, no build step:

```html
<script defer src="https://track.satsu.pro/tracker.js" data-site="YOUR_ID"></script>
```

Replace `YOUR_ID` with your site's ID (dashboard → Sites → your site → install).

| Attribute | Required | What it does |
|---|---|---|
| `data-site` | Yes | Your site ID. Without it the tracker does nothing. |
| `data-api` | No | Override the ingest endpoint. Defaults to the script's own origin + `/e`, so you normally never set this. |
| `data-track-paths` | No | Comma-separated path prefixes to limit tracking to (e.g. `/,/docs,/blog`). Omit to track every path. |

The tracker follows client-side navigation (`pushState`, `replaceState`, `popstate`), so single-page apps need no router integration.

## Quick-starts

Each folder in [`examples/`](./examples) is the minimal install for one framework, copied from the [install docs](https://satsu.pro/docs/install).

- **Plain HTML** — [`examples/html`](./examples/html): the tag in `<head>`.
- **Next.js (App Router)** — [`examples/nextjs`](./examples/nextjs): `next/script` in `app/layout.tsx`.
- **React (Vite / CRA)** — [`examples/react-vite`](./examples/react-vite): the tag in `index.html`.
- **Vue / Nuxt** — [`examples/vue-nuxt`](./examples/vue-nuxt): `app.head.script` in `nuxt.config.ts`.
- **Astro** — [`examples/astro`](./examples/astro): the tag in the base layout's `<head>`.

## Privacy

Sessions are derived from a daily-rotating fingerprint, never stored; no cookies, no persistent visitor IDs.

A visit is matched to a session by a hash of site, IP address, user agent, the current day and a secret salt. The resulting hash is stored as a session ID that rotates daily, so visits cannot be linked across days; raw IP addresses and user agents are never stored. Not collected by the tracker: cookies, localStorage IDs, cross-day fingerprints, session recordings, mouse movement, PII in event properties, reverse-IP company lookups. Details: [satsu.pro/docs/privacy](https://satsu.pro/docs/privacy).

## Links

- Docs: [satsu.pro/docs](https://satsu.pro/docs)
- Fact sheet for assistants: [satsu.pro/llms.txt](https://satsu.pro/llms.txt)
- Pricing: [satsu.pro/pricing](https://satsu.pro/pricing)
- Security disclosure: [satsu.pro/security](https://satsu.pro/security) · security@satsu.pro
- Public read API (Pro+): [satsu.pro/docs/api](https://satsu.pro/docs/api)
- Contact: hello@satsu.pro

## npm

[`npm/satsu`](./npm/satsu) and [`npm/tracker`](./npm/tracker) are README-only placeholders for the `satsu` and `@satsu/tracker` package names. There is no npm runtime yet — install via the script tag above.

## License

The contents of this repository are MIT licensed (see [`LICENSE`](./LICENSE)). The Satsu service, tracker and backend are proprietary and not covered by this license.
