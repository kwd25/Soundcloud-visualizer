# Soundcloud-visualizer

Multi-tenant web app that visualizes a logged-in SoundCloud user's musical landscape. Each user OAuths with SoundCloud → app crawls their liked tracks + the public favoriters of those tracks → builds a track ↔ track co-listener graph → clusters into communities (Louvain) → places nodes (ForceAtlas2) → an LLM labels each community as an imagistic "scene". Rendered as an interactive WebGL graph with track playback + edge inspection.

- **Live**: https://soundcloud-visualizer.vercel.app
- **Repo**: https://github.com/kwd25/Soundcloud-visualizer (public)
- **Local**: `~/Soundcloud-visualizer`

## Status snapshot

All 9 phases functional and shipped. Most recent work is on AI community labeling. Live data in Neon for the one auth'd user (Swagfart / `soundcloud:users:188233718`):

| Asset | Count |
|---|---|
| `auth_users` | 1 |
| `tracks` | ~1,215 |
| `users` | ~133k (universal cache across crawls) |
| `edges` (liked) | ~197k |
| `edges` (co_listener, weight ≥ 3) | ~23k |
| `layout` (tracks view) | ~1,100 |
| `layout` (bipartite view) | ~13k |
| `community_labels` (tracks view) | populated by AI step |

Two views:
- **Tracks** (default) — your 1,200 tracks clustered by shared listeners (co_listener edges)
- **People** — bipartite users + tracks (degree ≥ 3 prune)

Click an edge for top common listeners + track playback (both endpoints embed the SoundCloud widget).

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 App Router + React 19 | Turbopack default |
| TS | strict, `@/` alias for `src/` | |
| Lint+format | Biome (replaces ESLint+Prettier) | one tool |
| Auth | Auth.js v5 (next-auth@beta) | custom SoundCloud OAuth 2.1 + PKCE provider, JWT sessions |
| DB | Neon Postgres + Drizzle (HTTP driver) | |
| Background jobs | Inngest cloud | Vercel marketplace integration |
| Graph | graphology + forceatlas2 + louvain | |
| Renderer | sigma.js v3 (WebGL) | |
| AI | Anthropic Claude Haiku via `@ai-sdk/anthropic` | structured output via zod |
| UI | Tailwind v4 + shadcn/ui | dark glass theme, jade/amethyst accents |

## Where things go

```
src/app/                       — Next.js routes
  (authed)/                    — gated by await auth() in layout
    dashboard/                 — crawl status + recompute CTA
    graph/                     — sigma.js renderer
  api/
    auth/[...nextauth]/        — Auth.js handler
    crawl/{start,recompute,status}/
    graph/                     — owner's nodes+edges (view= param)
    communities/               — AI labels for view= param
    edge/                      — common listeners between two tracks
    inngest/                   — Inngest webhook
src/lib/
  auth/                        — providers/soundcloud.ts + index.ts + persist.ts
  db/                          — schema.ts + index.ts (Drizzle + Neon HTTP)
  soundcloud/                  — typed client, rate-limited, atomic token rotation
  inngest/
    client.ts                  — Inngest client + event types
    functions/
      crawl-owner-likes.ts     — full crawl (10-15 min)
      recompute-layouts.ts     — layouts+labels only (~60-90s)
    persist.ts                 — batch upserts
  graph/                       — build, community (Louvain), layout (FA2), projection (co_listener), persist
  ai/labeler.ts                — two-pass labeler (chunked, per-chunk step.run)
src/components/graph/          — GraphCanvas, GraphView, InspectorPanel, CommunityLegend, community-colors, hover-renderer
src/proxy.ts                   — DELETED (Next.js 16 quirk — see gotchas)
docs/                          — architecture.md, soundcloud-api-notes.md, phases.md
```

## Phases

| # | Phase | State |
|---|---|---|
| 1 | Foundation — scaffold, schema, CI | ✅ |
| 2 | Database wired (Neon via Vercel) | ✅ |
| 3 | Auth — SoundCloud OAuth 2.1 + PKCE | ✅ verified end-to-end on prod |
| 4 | SoundCloud API client (rate-limited, atomic token rotation) | ✅ |
| 5 | Inngest crawler (batched 50 tracks per step.run) | ✅ |
| 6 | Analysis — Louvain communities + FA2 layout, BOTH views | ✅ |
| 7 | Sigma.js WebGL renderer + tab switcher | ✅ |
| 8 | Inspector — node + edge panels with SoundCloud widget | ✅ |
| 8.5 | AI community labeling (Claude Haiku, two-pass) | ✅ shipped, iterating on prompt voice |
| 9 | Polish (ToS footer, error states, README, mobile) | 🚧 partially done |

## Conventions

- TypeScript strict — no `any`. Use `unknown` + narrowing.
- Tailwind + shadcn for UI. No CSS modules, no other UI libs.
- No comments unless explaining a non-obvious "why".
- `@/` alias for `src/`. Never read `process.env.X` directly — always `import { env } from "@/env"`.
- URN format always — `soundcloud:tracks:12345678`, never bare numeric IDs.
- Inngest step IDs follow `{step}-{NN}` zero-padded so retries find the right cache.

## Critical gotchas (consolidated lessons learned)

### Vercel
- **Vercel project framework must be `nextjs`.** Marketplace flow can leave it `null` → builds use `@vercel/static-build` → zero serverless functions emitted → every dynamic route 404s with `x-vercel-error: NOT_FOUND`. Diagnose with `pnpm dlx vercel build --prod && ls .vercel/output/functions/`. Fix: PATCH project to `{"framework": "nextjs"}`.
- **Sensitive env var type is write-only.** `vercel env add ... ` without `--no-sensitive` creates vars you can't read back via API/CLI. Fine for runtime, annoying for verification.
- **Hobby plan max function duration: 60s.** Every Inngest step.run() must fit. We set `export const maxDuration = 60` on `/api/inngest/route.ts` explicitly.

### Next.js 16
- File convention is `proxy.ts`, not `middleware.ts`. But — **don't re-export Auth.js `auth` directly** as the proxy. Re-export forms can be silently misdetected and emit a deployment with no callable function (the symptom that wasted hours: 404 on every route). Just do per-layout `await auth()` checks. We have no `proxy.ts` and that's correct.
- Async `cookies()` / `headers()` — must `await` them.

### Auth.js v5 + SoundCloud
- TypeScript module augmentation must target `@auth/core/types` and `@auth/core/jwt`, NOT just `next-auth` (re-exports don't propagate).
- SoundCloud's `/me` endpoint requires `Authorization: OAuth <token>`, **not Bearer**. Custom `userinfo.request` in the provider handles this.
- SoundCloud's token endpoint wants `client_secret_post` (creds in body, not Basic auth). Custom `token.request` handles this.
- Refresh tokens are single-use and rotate every call. Our SoundCloud client does **conditional UPDATE** (`WHERE refresh_token = $old`) for atomic rotation — works on the HTTP Neon driver, no websocket needed.

### Inngest
- **Lots of step.run() calls in one function can choke the free-tier scheduler.** We hit this at ~1,215 individual expand steps. Fix: batch 50 seeds per step (now ~25 expand steps total).
- **Per-step durable retries are the right place for transient API errors.** Don't crank `maxRetries` inside one step — instead split into per-chunk `step.run()` calls so each chunk retries independently with Inngest's exponential backoff. Function-level `retries: 3` gives ~3 cycles of full pipeline retry; combined with the SDK's `maxRetries: 1` you get ~6 attempts per AI chunk.

### Graph rendering
- **FA2 on 70k+ nodes blows 60s.** Always prune to degree ≥ 2 (or higher) at the **SQL layer** so the function never pulls dead-weight rows.
- **Louvain `detailed()` does NOT assign the community attribute** — only `assign()` does. We use `detailed()` for modularity then iterate `result.communities` to set node attrs ourselves.
- **Sigma's edge hit detection scales with rendered edge thickness.** We keep edges visually thin and do our own point-to-segment math on `clickStage` for a 14 px hit radius.
- **`adjustSizes: true` + sensory FA2 settings (`linLogMode`, `scalingRatio`, `gravity`)** were needed to stop track nodes from piling on top of each other.

### AI labeling
- **Sonnet is too slow for batched structured output under 60s.** Switched to **Haiku** (4-5× faster output). Same task family, much cheaper (~$0.03/pass vs ~$0.25).
- **`Overloaded` (HTTP 529) is transient but blocks if retry budget is too small.** Architecture: each chunk is its own `step.run()` so Inngest's durable retries handle overloads without re-running successful chunks.
- **Prompt voice** is the current iteration: pushing for fantastical / sensory / analogical labels ("Cherry Cola Skyway", "Iron-Pulse Cathedral") instead of literal genre stickers ("Nightcore Bootlegs"). Hard-banned: "SoundCloud", "Bootleg", "Remix", "Mix", "Anthems", bare genre names. Temperature 0.95.

## Dev loop

```bash
pnpm dev                                 # Next.js dev (port 3000)
pnpm typecheck                            # tsc --noEmit
pnpm check                                # biome
pnpm check:fix                            # biome --write
pnpm dlx vercel env pull .env.local       # sync env from Vercel
pnpm dlx vercel logs --since 10m --query '/api/inngest' --json --expand
node migrate.mjs                          # raw SQL migration via Neon driver (Drizzle PK reorder bug workaround)
```

## Trigger paths

| Action | How |
|---|---|
| New crawl (~15 min, fetches all of user's likes) | Dashboard → Start/Re-run crawl, or POST /api/crawl/start |
| Recompute layouts + AI labels only (~60-90s) | Dashboard → Recompute layouts only, or POST /api/crawl/recompute |
| View graph | `/graph`, tabs for Tracks / People |
| Read graph JSON | GET `/api/graph?view=tracks\|bipartite` |
| Read AI labels | GET `/api/communities?view=tracks` |
| Read edge details (common listeners) | GET `/api/edge?src=URN&dst=URN&view=tracks` |

## Env vars (all required, all in Vercel + local)

```
DATABASE_URL                   # Neon pooled connection
SOUNDCLOUD_CLIENT_ID           # SC dev app
SOUNDCLOUD_CLIENT_SECRET
AUTH_SECRET                    # >= 32 chars
NEXT_PUBLIC_APP_URL            # https://soundcloud-visualizer.vercel.app
INNGEST_EVENT_KEY              # via Inngest Vercel integration
INNGEST_SIGNING_KEY
ANTHROPIC_API_KEY              # for community labeling
```

## Open / next

- **Prompt voice iteration** for AI labels — currently pushing for fantastical/sensory style
- **Phase 9 polish** — ToS attribution footer, mobile responsive, README + screenshots
- **Eventual v2**: size-by control (degree / popularity / community role), community detail panel, search bar, taste/discovery/hybrid tabs

## Where to look first if something breaks

| Symptom | First check |
|---|---|
| 404 on every route after deploy | Vercel project `framework` setting |
| Crawl stuck mid-expand | Vercel logs for `/api/inngest` 504s; consider batching deeper |
| Layout step times out | Pre-filter at SQL, reduce iterations, raise minDegree |
| AI step fails | `claude-haiku-4-5` model name, ANTHROPIC_API_KEY presence, Anthropic status |
| All `community: null` in /api/graph | Louvain `detailed()` doesn't assign — manual setNodeAttribute needed |
| Edge click does nothing | `enableEdgeEvents` not needed; custom hit-test via clickStage |
