# SoundCloud API — operational notes

Distilled from research (sources at bottom). Bias toward what's **load-bearing for this project**, not exhaustive reference.

## Access

- **Requires Artist Pro subscription** (~$8–11/mo). If it lapses, `client_id` may stop working.
- Registration is self-serve on `developers.soundcloud.com`. Get `client_id` + `client_secret` immediately.
- One access level; no tiered quotas.

## Auth

- **OAuth 2.1 with PKCE required.** OAuth 2.0 deprecated Oct 2024.
- Supported flows:
  - **Authorization Code + PKCE** — for user-scoped data (our case)
  - **Client Credentials** — public reads only
- **Access token TTL: ~1 hour**.
- **Refresh tokens are single-use and rotate on every refresh.** This is the #1 footgun. The crawler must:
  1. Check `tokenExpiresAt` before each API call
  2. If close to expiry, call `POST /oauth/token` with `grant_type=refresh_token`
  3. **Atomically persist the new pair to `auth_users` before making the next call**
  4. Handle the case where the rotated token is lost (crash mid-flight) — user must re-auth

- No granular scopes. The token acts on behalf of the user with their full web permissions.

## Endpoints we use

| Endpoint | Purpose | Pagination |
|---|---|---|
| `GET /me` | profile of logged-in user | — |
| `GET /me/likes/tracks` | seed for crawl | linked_partitioning, page_size up to 200 |
| `GET /tracks/{urn}` | track detail | — |
| `GET /tracks/{urn}/favoriters` | expansion step 1 | linked_partitioning, practical cap ~5–10k |
| `GET /users/{urn}/likes/tracks` | expansion step 2 (other users) | **returns 403 if user set likes private** — skip gracefully |
| `GET /users/{urn}` | favoriter profile | — |

**URN format**: all IDs are strings like `soundcloud:tracks:12345678`. Numeric IDs deprecated June 30, 2025. Always use URNs.

**Base URL**: `https://api.soundcloud.com`. **NEVER use `api-v2.soundcloud.com`** — that's the internal API and using it gets your `client_id` permanently banned.

## Rate limits

- **No documented global per-app cap** for general reads.
- **Token issuance**: 50/12h per app, 30/h per IP. **Cache access tokens; never re-mint on each crawl.**
- **Play limit**: 15,000 stream requests/24h per `client_id`. Avoid by not hitting `/streams` — use the iframe Widget for playback.
- **Community-reported**: aggressive crawling without backoff has gotten apps permanently blocked. Our crawler enforces:
  - 200ms minimum gap between requests
  - Exponential backoff on 429/5xx (initial 1s, 2x up to 60s)
  - Max concurrency 1–2 (single-threaded BFS is fine)

## Pagination

- Always pass `linked_partitioning=true` — otherwise you get a flat array with no continuation cursor.
- Response shape: `{ collection: [...], next_href: "..." }`.
- Follow `next_href` literally; don't reconstruct.
- **Page size max: 200.** Use it.
- **Practical total cap: ~5–10k items** before `next_href` stops appearing or returns empty. Plan to sample on viral tracks, not enumerate.

## Streaming / audio

- **Use the iframe Widget API**, not the `/streams` endpoint.
- Widget handles auth, geo-blocking, and Go+ premium tracks transparently.
- Each `/streams` hit counts against the 15k/24h limit; widget doesn't.

## Terms of Service — load-bearing for this project

- ✅ **Authenticated user sees their own data**: fine, this is the whole point.
- ✅ **Showing public data of other users in the auth'd user's view**: allowed — it's data they could see themselves on soundcloud.com.
- ❌ **Public dashboard of someone else's account**: prohibited.
- ❌ **Persistent storage of "User Content"**: gray zone. Storing graph topology (URNs + edges + likes_count) is low risk; storing avatars, descriptions, comments, audio is higher risk. We frame the DB as an analytical cache.
- ⚠️ **Attribution required**: link every track node to its `permalink_url` on soundcloud.com.
- ❌ **Ads / monetization**: prohibited.
- ❌ **Fan/artist pages dedicated to specific accounts**: prohibited. Personal taste graphs that include many users are likely fine.

## Known gotchas

1. **Refresh token rotation race** — atomic write or die.
2. **`/users/{urn}/likes/tracks` returns 403** when user has private likes — skip, don't retry.
3. **Pagination caps silently** on viral tracks — `next_href` just stops appearing.
4. **HLS-only streams** since Nov 15, 2025 (MP3/Opus removed). Irrelevant if using widget.
5. **Firefox-broken auth code flow** as of GH issue #537 — test login in Chromium for now.
6. **Stream URL deprecation**: `hls_aac_160_url` is the current canonical stream URL.

## Useful new endpoint (May 2026)

`GET /users/{urn}/related` — related-artist recommendations. Useful as a fallback edge type when favoriter likes are private. Not used in v1 crawl but worth keeping in mind.

## Sources

- https://developers.soundcloud.com/docs/api/guide
- https://developers.soundcloud.com/docs/api/rate-limits
- https://developers.soundcloud.com/docs/api/terms-of-use
- https://developers.soundcloud.com/blog/oauth-migration/
- https://developers.soundcloud.com/blog/urn-num-to-string/
- https://developers.soundcloud.com/blog/api-streaming-urls/
- https://github.com/soundcloud/api/issues (community-reported issues, especially #284, #457, #489, #496, #537)
