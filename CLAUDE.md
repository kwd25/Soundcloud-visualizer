# Soundcloud-visualizer

Multi-tenant web app that visualizes a logged-in SoundCloud user's "community graph" — a network of their liked tracks and the public favoriters of those tracks, clustered into musical scenes.

See `docs/architecture.md` for the full design and `docs/phases.md` for the roadmap.

## Dev loop

```bash
pnpm dev           # Next.js dev server
pnpm typecheck     # tsc --noEmit
pnpm check         # biome lint + format check
pnpm check:fix     # biome auto-fix
pnpm db:generate   # generate migration from schema diff
pnpm db:push       # push schema to DB (dev only)
pnpm db:studio     # open Drizzle Studio
```

## Where things go

- `src/app/` — Next.js App Router routes + route handlers
- `src/lib/auth/` — Auth.js config + SoundCloud OAuth provider (phase 3)
- `src/lib/db/` — Drizzle schema, client, queries
- `src/lib/soundcloud/` — typed SoundCloud API client (phase 4)
- `src/lib/inngest/` — durable background crawl jobs (phase 5)
- `src/lib/graph/` — layout (ForceAtlas2) + community detection (Louvain) (phase 6)
- `src/components/ui/` — shadcn primitives
- `src/components/` — feature components (graph canvas, inspector, etc.)
- `src/env.ts` — zod-validated env vars (single source of truth)
- `docs/` — architecture, API notes, phases

## Conventions

- **TypeScript strict** — no `any`. Prefer `unknown` + narrowing.
- **Tailwind for styling, shadcn for primitives** — no CSS modules, no other UI libs.
- **No comments** unless explaining a non-obvious "why."
- **One feature per PR** — reference the phase from `docs/phases.md`.
- **Imports** use `@/` alias for `src/`.
- **Env vars** — never read `process.env.X` directly; always import from `@/env`.
- **DB writes** in transactions when touching multiple tables.
- **URN format** — SoundCloud IDs are always strings like `soundcloud:tracks:12345678`, never bare numbers. The schema enforces this.

## Critical constraints

- **Next.js 16** — newer than typical training data. Before writing route handlers, server components, or middleware, check `node_modules/next/dist/docs/01-app/` for current APIs.
- **SoundCloud API ToS** — see `docs/soundcloud-api-notes.md`. Two non-obvious rules: (1) refresh tokens are single-use and must be persisted atomically on every refresh; (2) only display data the authenticated user could see on soundcloud.com themselves.
- **Rate limits** — aggressive crawling gets `client_id`s permanently blocked. The crawler in `src/lib/inngest/` enforces 200ms gaps + exponential backoff on 429/5xx.
- **`api.soundcloud.com` only** — never use `api-v2.soundcloud.com` (it's the internal API and using it gets the app banned).

## Current phase

See `docs/phases.md`. Phases 1–3 complete and verified end-to-end on prod (login flow works, user persisted to Neon, logout works). Phase 4 (typed SoundCloud API client with rate limiting + atomic token rotation) is next.

## Auth notes

- The Auth.js setup uses **JWT sessions** (no DB session table). On first sign-in, the `jwt` callback upserts the user into `auth_users` with their access/refresh tokens.
- The atomic refresh-token rotation lives in the **SoundCloud API client** (Phase 4), not in the Auth.js callbacks — see [docs/architecture.md](docs/architecture.md#auth-flow) for why.
- TypeScript module augmentation for Auth.js types lives in `src/types/next-auth.d.ts`. Augment `@auth/core/*` modules, not just `next-auth` — the latter doesn't propagate to the actual interfaces.
- SoundCloud's userinfo endpoint requires `Authorization: OAuth <token>`, NOT `Bearer`. The provider has a custom `userinfo.request` for this.
- Next.js 16: route gating is done **per-layout** via `await auth()` (e.g. `src/app/(authed)/layout.tsx`), NOT via `proxy.ts`. We tried a `proxy.ts` that re-exported `auth` and it broke Vercel deploys — Next.js 16's proxy scanner mis-handles certain re-export forms, silently emitting a deployment with no callable function and causing edge-layer 404s on every route. If we ever need global proxy logic, wrap it: `export const proxy = auth((req) => { ... })` rather than re-exporting `auth` directly.

## Vercel project settings gotcha

**The Vercel project MUST have `framework: nextjs` set explicitly.** When Vercel projects are created via the Storage marketplace flow (Neon integration), the framework field can be left `null`. This makes Vercel fall back to `@vercel/static-build` instead of `@vercel/next`, which runs `next build` but emits ZERO serverless functions — every dynamic route 404s at the edge with `x-vercel-error: NOT_FOUND` despite a "successful" build. Diagnostic: `pnpm dlx vercel build --prod && ls .vercel/output/functions/` — if empty, the framework setting is wrong. Fix via PATCH to `/v9/projects/<id>` with `{"framework": "nextjs"}`, then `vercel pull --yes --environment production` to refresh local settings.
