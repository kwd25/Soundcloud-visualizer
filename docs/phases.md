# Phases

Running roadmap. Update checkboxes as work lands. Each phase has a goal + acceptance criterion.

---

## Phase 1 — Foundation

**Goal**: clean Next.js skeleton ready for iteration.
**Accept**: `pnpm dev`, `pnpm typecheck`, `pnpm check` all pass; `/api/health` returns 200; CI green.

- [x] Repo cloned + Next.js scaffolded
- [x] Biome replaces ESLint
- [x] All runtime + dev deps installed
- [x] shadcn/ui initialized
- [x] Drizzle schema + db client + zod env validation
- [x] Domain folders (`auth/`, `soundcloud/`, `graph/`, `inngest/`) with `.gitkeep`
- [x] Docs: `CLAUDE.md`, `README.md`, `docs/architecture.md`, `docs/soundcloud-api-notes.md`, `docs/phases.md`
- [x] Configs: `.env.example`, `.nvmrc`, `.vscode/`, GitHub Actions CI, `.claude/settings.json`
- [x] `/api/health` route + placeholder landing
- [x] Initial commit pushed to `main`

---

## Phase 2 — Database wired up

**Goal**: schema lives in Neon; can read/write from the app.
**Accept**: `pnpm db:push` succeeds against a Neon project; a manual `INSERT` + `SELECT` round-trips through Drizzle.

- [x] Create Neon project (via Vercel Storage marketplace integration) — auto-injects `DATABASE_URL`
- [x] `pnpm dlx vercel link` + `pnpm dlx vercel env pull .env.local`
- [x] `pnpm db:push` applies schema (use `--force` for non-TTY contexts)
- [x] Smoke test: `/api/health` reads `auth_users` count and returns it; INSERT → SELECT → DELETE round-trip confirmed via Neon HTTP driver
- [x] Placeholder env vars set in Vercel for Production / Preview / Development so deploys keep building
- [ ] Schema changes during dev: re-run `pnpm db:push` manually. Production migrations will use `pnpm db:generate` + commit + apply via deploy hook (configure in Phase 9).

---

## Phase 3 — Auth (the hard one)

**Goal**: log in with SoundCloud, persist tokens.
**Accept**: end-to-end OAuth round-trip works on prod; `auth_users` row created; access/refresh tokens stored.

- [x] Custom Auth.js v5 provider for SoundCloud (OAuth 2.1 + PKCE) — `src/lib/auth/providers/soundcloud.ts`
- [x] Custom `/me` userinfo handler using `Authorization: OAuth <token>` (SoundCloud's required header format)
- [x] JWT session strategy (no DB sessions); tokens persisted to `auth_users` once on sign-in via `jwt` callback
- [x] Type augmentation for `Session.user.urn` and `JWT.urn` (must augment `@auth/core/*`, not just `next-auth`)
- [x] Auth route handler at `src/app/api/auth/[...nextauth]/route.ts`
- [x] Next.js 16 `proxy.ts` (renamed from `middleware.ts`) for coarse route gating
- [x] Login button on landing page (server action calling `signIn("soundcloud")`)
- [x] Protected route group `(authed)/` with layout-level `auth()` check + redirect
- [x] `/dashboard` placeholder with username, avatar, URN, and logout
- [x] Verified OAuth round-trip on prod: logged in as Swagfart (`soundcloud:users:188233718`), row created in `auth_users`, logout works
- [ ] **Atomic refresh-token rotation** — deferred to Phase 4 (SoundCloud API client) where it actually matters. Needs `SELECT FOR UPDATE` which requires the WebSocket Neon driver, not HTTP.

### Phase 3 lessons learned
- **Vercel framework setting** — project must have `framework: "nextjs"` explicitly set. Marketplace integrations can leave it `null`, causing builds to use `@vercel/static-build` instead of `@vercel/next` (no serverless functions emitted, every dynamic route 404s with `x-vercel-error: NOT_FOUND`).
- **Vercel "sensitive" env vars** — CLI-default `vercel env add` creates `sensitive` type vars (write-only via API/CLI). When pulled, they return empty strings, which broke our env validation. Use `--no-sensitive` for vars you want to inspect later.
- **Next.js 16 `proxy.ts`** — re-exporting `auth` directly (`export const proxy = auth`) silently breaks Vercel deploys. If we ever add proxy logic, wrap it: `export const proxy = auth((req) => {...})`. For now we do auth checks in layouts via `await auth()`.
- **SoundCloud token endpoint** — Auth.js defaults to HTTP Basic auth for client credentials, but SoundCloud requires `client_secret_post` (creds in form body). Wrote a custom `token.request` handler in the provider config.
- **SoundCloud userinfo header** — uses `Authorization: OAuth <token>` not `Bearer`. Custom `userinfo.request` handler needed.
- **Auth.js type augmentation** — must augment `@auth/core/types` and `@auth/core/jwt` directly, not just `next-auth` (which only re-exports).

---

## Phase 4 — SoundCloud API client

**Goal**: typed wrapper around the API that handles rate limiting, backoff, URN handling, pagination.
**Accept**: from a local script, calling `client.me.likes()` paginates through all liked tracks; 429s back off correctly.

- [ ] `src/lib/soundcloud/client.ts` — fetch wrapper with auth header, retry, backoff
- [ ] `src/lib/soundcloud/types.ts` — response types from API
- [ ] `src/lib/soundcloud/endpoints.ts` — typed helpers per endpoint
- [ ] Pagination helper that follows `next_href`
- [ ] Token refresh integration (calls back into `src/lib/auth/`)
- [ ] Unit-ish test against a recorded response fixture

---

## Phase 5 — Crawler (Inngest)

**Goal**: BFS that populates Neon for one logged-in user.
**Accept**: triggering `crawl/requested` for an auth'd user creates a `crawl_jobs` row that progresses to `done` and writes thousands of edges.

- [ ] Inngest client + Next.js route handler
- [ ] `crawl/requested` function: paginate seed, expand favoriters, expand favoriter likes
- [ ] Caps: 500 seed, 500 favoriters/track, 10k users / 5k tracks total
- [ ] Skip 403s gracefully
- [ ] Batched writes to Neon
- [ ] `crawl_jobs` status updates as it progresses
- [ ] Manual trigger endpoint for testing

---

## Phase 6 — Analysis

**Goal**: assign communities and layout coordinates.
**Accept**: after a crawl, the `layout` table has a row per node with `(x, y, community_id)`.

- [ ] Louvain community detection
- [ ] ForceAtlas2 layout (500 iterations, scaling=10)
- [ ] Write `layout` rows in transaction
- [ ] Runs as final step of crawl Inngest function

---

## Phase 7 — Graph API + frontend

**Goal**: render the graph in the browser.
**Accept**: visiting `/graph` (auth'd) shows a pan/zoomable WebGL canvas with communities colored.

- [ ] `GET /api/graph` — returns nodes (with `x, y, community_id`) + edges for the auth'd owner
- [ ] sigma.js + WebGL renderer integration
- [ ] Pan/zoom, click selection
- [ ] Community color legend sidebar
- [ ] Empty state (no crawl yet) → "Run crawl" CTA

---

## Phase 8 — Inspector

**Goal**: click a node, see details + play audio.
**Accept**: clicking a track node opens a side panel with title, artist, and an embedded SoundCloud Widget player.

- [ ] Side panel component
- [ ] Track view: title, artist, artwork, embedded Widget, soundcloud.com backlink
- [ ] User view: username, avatar, follower count, soundcloud.com backlink
- [ ] Attribution: small "Data via SoundCloud" footer

---

## Phase 9 — Polish + ship

**Goal**: deployable to Vercel for end-to-end testing.
**Accept**: a freshly logged-in test account can complete login → crawl → graph view → audio playback on the deployed URL.

- [ ] Crawl progress UI (poll or SSE)
- [ ] Error states (rate limited, crawl failed, no likes)
- [ ] Logout / re-crawl actions
- [ ] Vercel deploy + env vars configured
- [ ] README updated with live URL
- [ ] ToS attribution footer
- [ ] Final QA pass

---

## v2 ideas (not scoped)

- Tabs for taste / discovery / hybrid graphs
- Search bar + community labels (auto-named from top tags)
- Real-time progressive crawl via SSE
- Comparison view between two users
- Mobile-optimized layout
- Edge bundling, semantic zoom
- Share-a-snapshot feature
