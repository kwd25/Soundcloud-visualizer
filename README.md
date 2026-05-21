# Soundcloud-visualizer

A multi-tenant web app that visualizes a SoundCloud user's "community graph" — their liked tracks plus the public favoriters of those tracks, clustered into the musical scenes they belong to.

Each user logs in with SoundCloud, the app crawls their public network, and renders an interactive WebGL graph (Google Maps–style pan/zoom) colored by community.

## Stack

- Next.js 16 + React 19, TypeScript strict, Tailwind v4, shadcn/ui
- Auth.js v5 with custom SoundCloud OAuth 2.1 + PKCE provider
- Neon Postgres + Drizzle ORM
- Inngest for durable background crawl jobs
- `graphology` (ForceAtlas2 + Louvain) for layout + community detection
- `sigma.js` (WebGL) for graph rendering

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in values
pnpm db:push                  # apply schema to Neon
pnpm dev                      # http://localhost:3000
```

## Required environment

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `SOUNDCLOUD_CLIENT_ID` | SoundCloud Developers (requires Artist Pro subscription) |
| `SOUNDCLOUD_CLIENT_SECRET` | Same as above |
| `AUTH_SECRET` | Random 32+ char string (`openssl rand -base64 32`) |
| `INNGEST_EVENT_KEY` | Inngest dashboard (optional in dev) |
| `INNGEST_SIGNING_KEY` | Inngest dashboard (optional in dev) |

## Docs

- [`CLAUDE.md`](./CLAUDE.md) — orientation for working in this repo
- [`docs/architecture.md`](./docs/architecture.md) — full design + decisions
- [`docs/soundcloud-api-notes.md`](./docs/soundcloud-api-notes.md) — API quirks, ToS, rate limits
- [`docs/phases.md`](./docs/phases.md) — implementation roadmap
