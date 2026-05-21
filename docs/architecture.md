# Architecture

## Goal

Multi-tenant web app where any SoundCloud user can log in and see a personalized **community graph** built from their liked tracks. Users see the "scenes" their taste sits inside: clusters of fellow listeners who overlap with them on specific tracks, with explorable connections to the artists and tracks that define each cluster.

## Graph model (v1: community graph)

**Nodes**

- `track` — every track the owner has liked, plus any track surfaced during expansion
- `user` — uploaders (artists) and fellow favoriters discovered during crawl

**Edges**

- `liked` — user → track (the main signal)
- Future: `uploaded`, `related_artist`, derived `track ↔ track` similarity

**Communities**

- Louvain clustering on the user-user co-like projection
- Each community ≈ a "scene"
- Colors assigned per community for the visualization

**Layout**

- ForceAtlas2 (graphology implementation)
- Computed server-side after each crawl
- Coordinates persisted per-owner in `layout` table

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 16 (App Router) | First-class Vercel deploy |
| Language | TypeScript strict | Catch errors at compile time |
| Auth | Auth.js v5 + custom SoundCloud provider | No off-the-shelf provider exists; PKCE flow required |
| DB | Neon Postgres (serverless) | Free tier fits; branchable |
| ORM | Drizzle (Neon HTTP driver) | Lightweight, edge-compatible |
| Background jobs | Inngest | Durable serverless; survives long crawls; free tier sufficient |
| Graph analysis | `graphology` + `-layout-forceatlas2` + `-communities-louvain` | All Node, runs in same process as crawler |
| Graph rendering | `sigma.js` (WebGL backend) | Handles 50k+ nodes smoothly |
| UI | Tailwind v4 + shadcn/ui | |
| Audio playback | SoundCloud iframe Widget API | Avoids 15k plays/24h limit |

## Data flow

```
┌─────────┐  login   ┌────────────────┐  trigger   ┌──────────┐
│ Browser │ ───────► │ Vercel (Next)  │ ─────────► │ Inngest  │
└─────────┘          │ Auth.js + API  │            │ crawler  │
     ▲               └────────────────┘            └────┬─────┘
     │                       ▲                          │ writes
     │  SSE / poll           │ reads                    ▼
     │                       │                    ┌──────────┐
     └───────────────────────┴────────────────────│  Neon    │
                                                  │ Postgres │
                                                  └──────────┘
```

1. Visitor hits site, clicks "Log in with SoundCloud."
2. Auth.js runs OAuth 2.1 + PKCE. On callback we upsert an `auth_users` row with access + refresh tokens.
3. If `last_crawled_at` is null or > 7 days old, the app fires an Inngest event `crawl/requested`.
4. The Inngest function runs the crawl (potentially hours), persisting nodes + edges + raw API responses to Neon, then runs Louvain + ForceAtlas2 and writes layout coordinates.
5. The frontend polls (or subscribes via SSE) for `crawl_jobs.status` and shows progress.
6. Once done, the graph view loads layout + edges from Neon and renders with sigma.js.

## Database schema

See [`src/lib/db/schema.ts`](../src/lib/db/schema.ts). Key tables:

- `auth_users` — one row per logged-in SoundCloud user; holds rotating tokens
- `users` — universal table of all SoundCloud users we've encountered (auth users + favoriters + uploaders)
- `tracks` — universal table of tracks
- `edges` — **per-owner** graph edges (every owner has their own subgraph view; `(owner_urn, src_urn, dst_urn, edge_type)` is the PK)
- `layout` — **per-owner** node coordinates + community assignment
- `crawl_jobs` — status tracking for the UI

The split between universal entity tables (`users`, `tracks`) and per-owner relationship tables (`edges`, `layout`) means we deduplicate metadata across owners while keeping graph topology isolated.

## Auth flow

- **Provider**: custom OAuth 2.1 + PKCE config for `https://secure.soundcloud.com/authorize` + `/oauth/token`
- **Storage**: Drizzle adapter for Auth.js writes session into Postgres
- **Token rotation**: every API call from the crawler checks `tokenExpiresAt`. If within 60s of expiry, refresh and **atomically write** the new pair before making the next API call. Single-use refresh tokens make this critical — a race or crash mid-rotation locks the user out.

## Crawl algorithm

```
1. Load owner's access_token; refresh if needed (atomic write of rotated refresh_token).
2. Page /me/likes/tracks  →  seed_tracks  (cap: 500)
3. For each seed_track (200ms gap, exponential backoff on 429/5xx):
     Page /tracks/{urn}/favoriters  (cap: 500 per track; sample if more)
4. For each discovered favoriter:
     Page /users/{urn}/likes/tracks  (skip on 403 — private likes)
     Keep tracks that appear in seed_tracks OR have appeared >= 2 times in this crawl
5. Persist nodes + edges to Neon in batches.
6. Build graphology Graph; run Louvain → community_id per node.
7. Run ForceAtlas2 (500 iterations, scaling=10) → x,y per node.
8. Write layout rows; mark crawl_job done.
```

Hard caps for v1: ~10k users / ~5k tracks per owner. Tunable.

## Rendering

- sigma.js with WebGL renderer
- Node size by `likes_count` (tracks) or `followers_count` (users)
- Node color by `community_id`
- On click: side inspector with SoundCloud iframe Widget + permalink backlink
- Pan/zoom: native sigma.js camera, no semantic zoom in v1

## Out of scope for v1

- Tabs for taste / discovery / hybrid graphs (planned for v2)
- Search bar, time filters, community labels
- Real-time progressive crawl streaming
- Sharing / embedding
- Mobile-optimized UX
- Edge bundling, semantic zoom

## Key decisions log

1. **Multi-tenant over single-user** — anyone logs in, sees their own graph. ToS-compliant because each user only sees data they could see on soundcloud.com themselves.
2. **Inngest over Vercel cron** — Vercel functions have 10–60s timeouts; crawls take hours. Inngest is purpose-built for durable long-running jobs.
3. **Community graph as v1 (not taste / discovery / hybrid)** — best balance of visual impact ("scenes" jump out) and implementation complexity.
4. **Biome over ESLint + Prettier** — one tool, faster, less config drift.
5. **`api.soundcloud.com` only** — using `api-v2.soundcloud.com` (the internal API) gets apps banned.
6. **iframe Widget for playback** — bypasses the 15k plays/24h `client_id` limit.

## Things to revisit later

- Persistent caching of metadata vs. session-only cache (ToS gray zone — current stance: graph topology + URNs + minimal metadata is OK; avatars/descriptions are session-only)
- Whether to anonymize favoriter user data in the UI
- Whether to surface the new (May 2026) `/users/{urn}/related` endpoint as an alternative edge type when likes are private
