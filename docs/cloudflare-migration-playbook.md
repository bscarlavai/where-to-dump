# Cloudflare Migration Playbook

Everything learned building wheretodump.com (the reference implementation),
packaged as a migration plan for **splash-pad-finder** and
**self-car-wash-finder**. Goal: kill the $50/mo Supabase bill, consolidate on
the Lavai Labs Cloudflare account, and give both sites the architecture that
this site validated. Both sites already deploy to Cloudflare Workers via
OpenNext — this is a **Supabase extraction + account move**, not a rehost.

Written 2026-08-01. Reference commits: the where-to-dump repo is the living
example of every pattern below.

---

## Part 1 — The validated stack (what to copy)

### 1.1 D1 replaces Supabase Postgres

- Schema style: SQLite. JSON goes in TEXT columns parsed by a tiny
  `parseJson()` helper; booleans are INTEGER 0/1 mapped in one `toX()`
  row-converter per entity. See `where-to-dump/db/schema.sql` and
  `src/lib/db.ts`.
- **The one non-obvious requirement:** the DB accessor must be async —
  `await getCloudflareContext({ async: true })` — or `next build` fails when
  prerendering any page/sitemap that queries the DB. Every query helper is
  `await (await getDb()).prepare(...)`. (Cost us a broken build; don't
  rediscover it.)
- Local dev: `initOpenNextCloudflareForDev()` in next.config gives `next dev`
  real local D1 bindings. Local state lives in `.wrangler/state` — NOTE:
  changing `database_id` in wrangler.jsonc silently gives you a fresh empty
  local DB (the file is keyed by id), so reload the snapshot after.
- Local↔production sync: `scripts/deploy/push-production.ts` pattern —
  export newest local sqlite (DDL from `sqlite_master` + `.mode insert`
  dumps), DROP tables child-first (remote D1 enforces FKs; parents-first
  fails), push via `wrangler d1 execute --remote --file`, then **verify by
  comparing local/remote row counts** and exit nonzero on mismatch. Remote
  pushes fail transiently; retry once. Never trust an eyeballed grep of
  wrangler output.
- Positional-INSERT gotcha: dumps are positional, so remote schema must have
  the exact column order of the local DB (which drifts via ALTERs). Always
  regenerate the schema from the local sqlite, never from a hand-maintained
  schema file.

### 1.2 Cache-first delivery (the sisters' known flaw)

- `open-next.config.ts`: `incrementalCache: r2IncrementalCache` — both
  sister sites currently ship the `"dummy"` cache, meaning every request does
  DB work. This is the single biggest performance fix of the migration.
- Create bucket: `wrangler r2 bucket create <site>-inc-cache`; binding name
  `NEXT_INC_CACHE_R2_BUCKET`. R2 must be enabled once per account in the
  dashboard (human clickthrough; free tier).
- `next.config` `headers()`: `Cache-Control: public, s-maxage=86400,
  stale-while-revalidate=604800` on everything except `/admin|/api|/auth`.
- Pages use ISR (`export const revalidate = 3600`) — data only changes on
  import/approval, so nothing should query per-request.

### 1.3 Auth: Cloudflare Access replaces Supabase Auth

- Zero Trust **free plan** (50 seats). Self-hosted app covering `/admin` and
  `/api/admin`, policy = allow listed emails. One-time-PIN login, no identity
  provider setup.
- Code side: fail closed. Server checks
  `cf-access-authenticated-user-email` header in production on both the admin
  page and admin API routes (`src/lib/admin-auth.ts`). If Access is
  misconfigured, admin is inaccessible rather than open.
- Delete `@supabase/ssr`, `@supabase/supabase-js`, all auth routes/middleware.
  There are no end-user accounts on any of these sites — admin is the only
  auth surface, so nothing to migrate except "your email in a policy."

### 1.4 Images: Cloudflare Images on the Lavai Labs account

- One Images subscription ($5/mo per 100k) on Lavai Labs serves ALL sites —
  part of the point of consolidating. Delivery URL hash `D-eKqFy3vQzSCwigzF9JpQ`.
- Pattern: `photo-map.json` (`place_id → cf_image_id`) committed per site so
  DB rebuilds and remote imports never re-upload (`scripts/images/upload-photos.ts`).
- Variants are per-account: `detail` 1200x800, `card` 600x400, `thumbnail`
  300x300 (script has `--setup-variants`).
- Migration of existing images: both sisters' images live on the OLD account
  (car wash: old CF Images; splash pad: check Supabase Storage vs CF Images).
  Re-upload by URL into the new account using the upload script pattern;
  images keep working from the old account until cutover, so zero downtime.
- Icon/OG asset generation: `scripts/brand/generate-assets.ts` —
  qlmanage renders SVGs but mangles targets under ~200px; always render at
  512 and downsample with sips.

### 1.5 Ops / CI

- `wrangler.jsonc`: pin `"account_id"` (Lavai Labs:
  `d42538cebc7d337a0c0769a11f261ea5`) so deploys can't hit the wrong account.
  Custom domains via `"routes": [{ "pattern": "...", "custom_domain": true }]`.
- Workers Builds (repo connect): build command `npm run build:cf` (seeds the
  build machine's local D1 from the committed snapshot, then
  `opennextjs-cloudflare build`), deploy command `npm run deploy:only`.
  Uncheck non-production-branch builds.
- Wrangler auth: separate login per Cloudflare account
  (`wrangler logout && wrangler login`); tokens don't pick up accounts
  created after login.
- Dev-server footguns seen repeatedly: turbopack's `.next` cache corrupts
  after route-conflict crashes (symptoms: `require is not defined`, 300% CPU
  idle, dead file-watcher) — fix is `rm -rf .next` + restart, worth trying
  before any deeper debugging.
- CSS: never define a token as `--x: var(--x)` across `:root` and `@theme`
  (self-reference invalidates the property silently). Values live directly
  in `@theme`.

### 1.6 SEO layer (the GoFarmHop lesson, itemized)

Non-negotiables that must survive the migration (and be ADDED where the
sisters lack them):
- `alternates.canonical` on every data page; LocalBusiness/GeoCoordinates
  JSON-LD on detail pages; FAQPage JSON-LD where FAQs render.
- Real `notFound()` — no soft 404s.
- No route hijacking: category-style pages get explicit path segments.
- Sitemap URLs must match Next's canonical form (no trailing slashes unless
  `trailingSlash` is set — the 308 hop wastes crawl).
- robots.txt allows all, disallows `/admin` + `/api`.
- Guides: build-time MDX precompilation (no runtime fs on Workers). Voice
  rules: no emdashes, no AI-tell phrases, answer-first.

### 1.7 Working conventions

- Scripts share `scripts/lib/env.ts` (reads `.env.local`) and
  `scripts/lib/d1.ts` (query/exec against local D1 via wrangler CLI).
- Every data-writing script: `--dry-run` mode, prints what it would do,
  eyeball before writing. Generated SQL goes to `db/update-*.sql`
  (gitignored).
- Review model: scripts/AI score and recommend; heuristic scripts NEVER set
  status. AI judgment passes with per-row written reasoning MAY apply
  approve/reject (standing arrangement from wheretodump), "unsure" always
  stays human.
- Cost discipline: any billed operation (Outscraper etc.) gets explicit
  approval first, with estimates quoted from expected BILLED records
  (kept × ~1.6), not kept records.

---

## Part 2 — Migration plan per site

### Recommended order

1. **splash-pad-finder first** — newer Next (15.x), smaller Supabase surface
   (~66 refs), simpler admin. Validates the extraction recipe on the easier
   target.
2. **self-car-wash-finder second** — Next 14 (works fine on OpenNext; upgrade
   to 15/16 is optional and should be a SEPARATE change after migration),
   ~103 Supabase refs, RLS setup, bigger admin/verification surface.

### Phase 0 — Inventory (per site, ~an hour)

- Dump the Supabase schema: tables, columns, row counts
  (`select table_name, ... from information_schema`). Sisters use Postgres
  schemas (`farmhop` etc.) — car wash was slated for a `carwash` schema;
  splash pad may be in `public`. Verify per site.
- Grep the app for every Supabase call site; list the distinct query shapes
  (this becomes the D1 query module).
- Identify Supabase Storage buckets and whether images are Supabase-hosted
  or old-account CF Images (car wash: CF Images; splash pad: verify).
- Confirm admin is the only authed surface (expected: yes).

### Phase 1 — Data (Supabase → D1)

1. Write `db/schema.sql` (D1/SQLite translation: jsonb→TEXT, bool→INTEGER,
   timestamptz→TEXT, serial→INTEGER PRIMARY KEY, keep FKs + UNIQUE + indexes).
2. Export data: per-table `COPY ... TO CSV` (or REST paginated select) →
   converter script emits `INSERT` dump (reuse where-to-dump's
   import/escaping helpers; watch NULL vs '' and NOT NULL DEFAULT columns —
   the `google_types` NOT NULL bug came from exactly this).
3. Load into local D1, spot-check counts + a few rows.
4. Adapt `push-production.ts` (table list is the only change) and push to a
   new `wrangler d1 create <site>-db` on Lavai Labs.

### Phase 2 — Code (the query swap)

1. Add `src/lib/db.ts` (async getDb — copy verbatim) and a query module
   mirroring the Supabase call shapes found in Phase 0. Where-to-dump's
   `src/lib/queries/*` shows the target shape, including exported
   `VISIBLE`-style clauses and CARD_FIELDS-style shared field lists (keep
   them in ONE place; the sisters likely have drift copies like we did).
2. Replace call sites page by page; delete Supabase clients, `@supabase/*`
   deps, auth middleware, RLS docs.
3. Admin: port the D1-backed admin page + `/api/admin` route pattern (bulk
   status updates, fail-closed Access check). Car wash keeps its
   review_status semantics — statuses are only changed by the admin UI or an
   AI judgment pass with reasons.
4. Fix the cache config (Section 1.2) in the same pass — it's two files.

### Phase 3 — Account move (old CF account → Lavai Labs)

1. Images: re-upload to Lavai Labs Images via URL map; swap the account hash
   constant; keep the old account's images live until verified.
2. Domains: add each zone (selfcarwashfinder.com, gosplashpad.com) to the
   Lavai Labs account and repoint nameservers at the registrar (zones can
   coexist during propagation; the old zone keeps serving until NS flip
   completes). Then attach custom domains to the new Workers via
   wrangler routes.
3. Deploy the migrated worker on Lavai Labs, pin `account_id`, verify on a
   workers.dev/preview URL BEFORE the NS flip so cutover is instant.
4. Cloudflare Access apps for each site's `/admin` (same Zero Trust org).
5. Workers Builds hookup per repo.
6. Ezoic note: ads integration on both sites is DNS/zone-sensitive — verify
   how Ezoic integrates (ads.txt redirect is already the manager-hosted
   pattern; if Ezoic proxies via NS, coordinate the NS flip with their
   settings so revenue doesn't blip).

### Phase 4 — Verify + decommission

1. Parity checklist per site: home, state, city, detail, near-me, search,
   sitemaps, robots, admin (behind Access), 404 behavior, canonical tags,
   JSON-LD present, Cache-Control headers live, images serving from new
   account.
2. Watch Search Console for a week (no coverage regressions — URLs don't
   change, so there should be none).
3. Pause Supabase project → confirm nothing breaks for a few days → delete
   project, cancel plan. **Savings: $50/mo.** New marginal cost: $0 (D1/R2
   free tiers; Images plan already paid on Lavai Labs).
4. Old CF account: after both zones and any Images/Workers are moved, it can
   be emptied/closed.

### Effort estimate

- Splash pad: ~1 focused day (extraction recipe is mechanical; admin port is
  the biggest chunk).
- Car wash: ~1.5–2 days (more call sites, older Next, verification scripts to
  repoint at D1).
- Each ends with the same hardened ops the reference site has: verified
  production pushes, CI deploys, Access-gated admin.

### Explicitly out of scope (do later, separately)

- Next.js upgrades (car wash 14 → current).
- The `src/lib/vertical/` config extraction (making site #6 a config swap) —
  worth doing across all three sites once, but it's a refactor, not a
  migration requirement.
- SEO gap-closing on the sisters (canonicals/JSON-LD where missing) — high
  value, and Phase 2 touches the same files, so fold in opportunistically
  but don't let it block cutover.

---

## Addendum: reviews decision (2026-08-01)

- **splash-pad-finder:** DELETE the review system during migration. Zero
  reviews ever submitted (Supabase email-auth friction killed it), and it is
  the only Supabase Auth consumer — removing it simplifies Phase 2
  substantially. Port car wash's pattern later only if ever wanted.
- **self-car-wash-finder:** KEEP reviews (~180 real ones = unique UGC).
  Migrate the table to D1; keep the public form + honeypot, and add
  Cloudflare Turnstile (free) to the form during the port.
- **where-to-dump:** no star reviews. The vertical-correct future feature is
  a "report fees / confirm info" public form feeding the fees moat
  (submissions table already fits). Post-traffic feature; not now.
