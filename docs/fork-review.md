# go-farm-hop Fork Review (2026-07-29)

Deep review of the go-farm-hop codebase performed before forking it as the base for
where-to-dump. Findings apply to the copied code in this repo until fixed. File:line
references are against go-farm-hop at the time of the fork (identical to this repo's
initial commit).

## Verdict

Fork go-farm-hop for the *shape* and back-port GoSplashPad's SEO layer. The URL
topology, taxonomy indirection, sitemap infrastructure, guides pipeline,
OpenNext/Workers deployment, admin moderation flow, and submit/review pipeline are
real, working, transferable assets. The rendering strategy is the one thing that is
genuinely wrong: every page view is a cold Worker invocation plus 4–6 Supabase round
trips with no cache layer anywhere. Fix the delivery layer first, while the codebase
is still small.

## 1. Data fetching: near-100% runtime SSR, zero working cache

- No `generateStaticParams` on any data page (only `guides/[slug]/page.tsx:12`).
  Confirmed via `.next/prerender-manifest.json`: only static shell pages prerender.
- `open-next.config.ts:8-10` sets `incrementalCache: "dummy"`, `tagCache: "dummy"`,
  `queue: "dummy"` — so every `export const revalidate = ...` in the codebase is a
  no-op. `next.config.ts` is completely empty: no `headers()`, no Cache-Control.
- Query fan-out per request:
  - `[stateSlug]/page.tsx:30,48-54` → 6+ queries; `getNearbyStates` internally does a
    full 50-row states scan; `getFarmsByState` pulls every farm in the state with no
    limit just to compute activity counts.
  - `[locationSlug]/page.tsx` → ~5 queries/view (metadata re-runs `getFarmBySlug`).
  - `sitemap-farms.xml/route.ts:21-36` paginates the whole farms table on every
    uncached request.
- 53 `.from()` call sites + 1 `.rpc` + 2 storage = 56 total; ~22 leak outside
  `src/lib/queries/` (sitemaps, API routes, pages, `slugify.ts:26`,
  `admin-check.ts:50`).

## 2. Supabase coupling

- Three clients: `server.ts` (service-role key, schema farmhop — all public reads),
  `browser.ts` (reviews/admin/login), `ssr.ts` (used by exactly one auth callback).
- Public reads use the service-role key → RLS policies are decorative.
- `admin-check.ts:5,10` creates clients without `db.schema` → `.from("profiles")`
  hits `public.profiles`, not `farmhop.profiles`. Latent bug.
- Auth: no `middleware.ts` (splash pad has one). `/admin` gate is a client-side
  `useEffect` redirect (`admin/layout.tsx:30-48`) — API routes are protected, the
  shell is not. TODO at `:42` for `is_admin` check never finished.
- Storage: images are Cloudflare Images (`lib/cloudflare-images.ts`); Supabase
  Storage appears only as legacy cleanup. `FarmImage.tsx` uses bare `<img>` — no
  srcset/sizes.
- Writes: all via API routes with service key, no Server Actions.
  - `POST /api/submit-location` — unauthenticated, honeypot+timing only, NO rate limit.
  - `POST /api/reviews` — bearer-gated, NO rate limit.
  - `POST /api/lookup-place` — **unauthenticated, unrate-limited proxy to Google
    Places with the API key = open billing endpoint.**
  - `lib/rate-limit.ts` is in-memory per-Worker-isolate (near-useless on CF) and only
    applied to 3 read routes.

## 3. What actually needs a live DB at request time

Structurally nothing on the public read path. Listings change only on import/admin
approval. Reviews are admin-moderated. `/near-me` is fully client-side geolocation
hitting `/api/farms-in-bounds`, which is plain bounding-box + haversine over lat/lng
(no DB geo features) — works identically off a static index or D1. Genuinely live:
admin CRUD, the two submission forms, review reads (human-timescale changes).

Splash pad's comment (its `[locationSlug]/page.tsx:31-34`) explains why SSG was
abandoned: prerendering 10k+ pages blew the Worker bundle limit. The fix is NOT
"fully dynamic with no cache" — it's edge caching + R2 incremental cache, or D1.

## 4. Code quality

Good: `lib/queries`/`lib/constants` conventions; consistent query error handling;
activity-slug taxonomy triple-map (`activity-slugs.ts`) is genuinely reusable;
Tailwind v4 tokens in one block (`globals.css:4-68`); build-time MDX precompilation;
honeypot+timing spam defense; lazy-loaded SSR-disabled Leaflet map.

Bad:
- **Route hijack:** `[citySlug]/page.tsx:48-53` — if the citySlug matches an activity
  slug it renders a StateActivityPage instead. `/ohio/pumpkin-patches` and
  `/ohio/columbus` share a route; any city whose slug collides with a taxonomy term
  is silently unreachable forever.
- **Soft 404s:** state/city/location/county pages render "not found" JSX with HTTP
  200 (`[stateSlug]:32`, `[citySlug]:60`, `[locationSlug]:48`, `county:44`). No
  `not-found.tsx`, `error.tsx`, or `loading.tsx` anywhere.
- **Duplication:** `faqItems` blocks copy-pasted 5x (~200 lines); breadcrumb markup
  inlined 8+ times while `components/Breadcrumb.tsx` sits unused outside guides;
  haversine implemented 4 times.
- **Dead code:** `MapEmbed.tsx` (48 lines), `placeholder-data.ts` (458 lines),
  `admin/reports/page.tsx` stub with no backing route.
- **God components:** `admin/farms/page.tsx` 871 lines; `submit/page.tsx` 657 lines
  (~20 useState); `ReviewForm.tsx` 659 lines.
- `admin/layout.tsx:81+` injects a raw `<style>` block with hardcoded hex — second
  styling system next to Tailwind tokens.

## 5. SEO: regressions vs GoSplashPad (likely cliff contributors)

Missing here, present in splash-pad-finder:
1. `LocalBusiness`/`AggregateRating`/`GeoCoordinates`/`OpeningHours` JSON-LD on the
   detail page (splash pad `[locationSlug]/page.tsx:172-195`).
2. `alternates.canonical` on data pages (only `near/[citySlug]` and guides have one)
   — combined with the route hijack this is an active duplicate-content risk.
3. `openGraph`/`twitter` metadata + `opengraph-image.tsx` + `/api/og` route.
4. `middleware.ts`, non-empty `next.config.ts` (headers, poweredByHeader, ads.txt
   redirect), monetization components (`lib/ads.ts`, `AdPlacement.tsx`,
   `EzoicRouteHandler.tsx`), reports feature, `Footer`/`Nav` extracted components.

Where farm hop is ahead of splash pad (why we forked this one): Next 16.2.1/React
19.2.4, Cloudflare Images, activity-slug taxonomy, county pages, rate-limit util,
parse-jsonb, separated 3-client supabase lib.

Also: `BASE_URL` hardcoded in `lib/sitemap.ts:46`; `NEXT_PUBLIC_SITE_URL` defined
but used nowhere; sitemaps emit trailing-slash URLs with no `trailingSlash` config
set — verify canonical form matches.

## Top 5 improvements for this fork (do in order)

1. **Fix caching before anything else.** OpenNext R2 incremental cache instead of
   "dummy"; `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800`
   on HTML via `headers()`; revalidate-on-publish from admin routes. This is the
   difference between a $5/mo and a $200/mo site — and removes the need for a
   hosted Postgres.
2. **Extract a vertical config module** (`src/lib/vertical.ts` + copy module):
   site name, base URL from env, taxonomy labels, shared `buildFaqItems()` /
   `buildSeoParagraphs()` returning `{question, answerText, answerJsx}`. Kills the
   5x faqItems duplication and the ~300-400 lines of vertical prose welded into JSX.
3. **Back-port splash pad's SEO layer + add what neither has:** LocalBusiness
   JSON-LD, canonicals + OG on all data pages, `opengraph-image.tsx`/`api/og`,
   shared `<JsonLd>` component and `buildMetadata()` helper.
4. **Real 404s + kill the route hijack:** `notFound()` in the four soft-404 sites,
   add `not-found.tsx`/`error.tsx`/`loading.tsx`, move activity pages to
   `/[stateSlug]/activity/[activitySlug]`.
5. **Consolidate seams + harden writes:** one DB client factory (schema from env),
   all queries behind `lib/queries/`, one haversine, use `Breadcrumb` everywhere,
   server-side admin guard via middleware, rate-limit all POST routes (especially
   the Google Places proxy) with CF Rate Limiting/KV, delete dead code.

## Migration cost notes (farm → waste vertical)

- Mechanical: theme tokens (`globals.css`), fonts (`layout.tsx:7-17`), taxonomy
  label maps, ~380 identifier renames (Farm/farm_id/FarmCard/...), schema name.
- Real cost: ~300-400 lines of farm prose in JSX across 6 files (state/city/near
  pages + faqItems); `lib/utils/season.ts` (65 lines of agritourism seasonality —
  delete); 6 MDX guides (rewrite for the new vertical); amenity vocabulary and
  review meta (SEASON_LABELS etc.) need remodeling.
