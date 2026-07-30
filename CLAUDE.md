@AGENTS.md

# Where To Dump — Developer Notes

## Project

Waste disposal facility directory — landfills, transfer stations, recycling
centers, e-waste dropoff, scrap metal, RV dump stations.

- **Domain:** wheretodump.com (verify purchase before launch; see docs/research-notes.md for alternates)
- **Sister sites:** GoSplashPad (splash-pad-finder), GoFarmHop (go-farm-hop), Self Car Wash Finder
- **Forked from:** go-farm-hop on 2026-07-29. Code is still farm-flavored until the
  migration checklist below is done. Read `docs/fork-review.md` before touching the
  data or rendering layers — it documents every known defect in the inherited code.
- **Research:** `docs/research-notes.md` — keyword data, competitor (findadump.com),
  data sources, monetization economics, launch strategy.

## Architecture decisions (differ from the sisters — do not copy their patterns)

1. **No Supabase.** Data lives in Cloudflare D1 (SQLite). Import scripts run
   locally and push via wrangler. The $50/mo Supabase bill on the sister sites is
   the reason this project exists on D1. Admin auth: Cloudflare Access, not
   Supabase Auth.
2. **Cache-first delivery.** OpenNext R2 incremental cache (NOT `"dummy"` — fix
   open-next.config.ts), `Cache-Control: public, s-maxage=86400,
   stale-while-revalidate=604800` on HTML via `headers()` in next.config.ts,
   revalidate-on-publish from admin actions. Listing data only changes on
   import/approval; no page should query the DB per-request.
3. **SEO layer is non-negotiable, from day one** (GoFarmHop shipped without it and
   got suppressed): LocalBusiness/GeoCoordinates JSON-LD on facility pages,
   `alternates.canonical` + openGraph on every data page, real `notFound()` (no
   soft 404s), opengraph-image. Back-port from splash-pad-finder
   (`[locationSlug]/page.tsx:172-195`, `opengraph-image.tsx`, `api/og/`).
4. **No route hijacking.** Category pages live at explicit
   `/[stateSlug]/category/[categorySlug]` — never overload `[citySlug]`.
5. **Vertical config module.** All site copy, taxonomy labels, FAQ builders in
   `src/lib/vertical/` — no prose welded into page JSX. This fork pays the
   extraction cost once; every future directory site is then a config swap.

## Fork migration checklist (updated 2026-07-30)

1. [x] Caching: R2 incremental cache + Cache-Control headers (create the R2
       bucket + real D1 id in wrangler.jsonc before first remote deploy)
2. [x] Data layer: D1 everywhere; Supabase fully deleted (deps, clients, auth,
       admin UI, migrations). Schema in db/schema.sql; import via
       scripts/import-facilities.ts. Indiana loaded locally (549 facilities).
3. [x] Rename vertical: Facility types/components/queries/pages done
4. [~] Vertical config: prose rewritten in place for waste; NOT yet extracted
       into a config module (do before spinning up the next directory site)
5. [x] SEO layer: LocalBusiness JSON-LD on detail, canonicals + not-found.tsx +
       error.tsx everywhere. STILL TODO: opengraph-image.tsx + /api/og back-port
6. [x] Soft 404s → notFound(); route hijack killed (/[state]/category/[slug])
7. [x] Consolidated: one haversine (lib/utils/geo.ts), Breadcrumb component,
       dead code deleted
8. [~] Writes: all dangerous routes deleted (no admin/auth/submit APIs in v1).
       In-memory rate limiter still on the 3 read routes — swap for CF Rate
       Limiting when adding real write endpoints
9. [ ] Guides: farm MDX deleted; write waste-vertical guides (mattress, fees,
       e-waste by state, RV etiquette)
10. [x] Design: "Hi-Vis Industrial" — safety orange #FF6B1A + asphalt charcoal
        #1A1D21, Barlow Condensed display + Barlow body, sharp corners, charcoal
        nav. Tokens in globals.css.

## Known issues / next work

- Facility photos: pipeline built (`npm run photos`, scripts/images/
  upload-photos.ts) — downloads photo_url, buffer-uploads to Cloudflare Images
  (NEW CF account d42538ce..., not the sister sites' account), writes
  cf_image_id to D1 + outscraper-data/cf-images-map.json (place_id map reused
  by import-facilities.ts so rebuilds/remote import keep images). Needs
  CLOUDFLARE_IMAGES_API_TOKEN in .env.local; run `--setup-variants` once
  (detail/card/thumbnail), then `--limit 5` to smoke-test, then full run.
- Admin review (built 2026-07-30, exception-based model): 'imported' stays
  visible at launch; manual review targets only the flagged tail. `npm run
  score` (scripts/review/score-facilities.ts) writes review_score 0-100 +
  review_reasons — never status. /admin shows the queue worst-first with bulk
  approve/reject via POST /api/admin/review. Local dev is open;
  production REQUIRES a Cloudflare Access application covering
  wheretodump.com/admin* AND /api/admin* (routes also fail closed on the
  Cf-Access-Authenticated-User-Email header, src/lib/admin-auth.ts). Re-run
  `npm run score` after each state import.
- Trailing-slash mismatch: sitemap URLs emit trailing slashes; Next redirects
  to non-slash (308). Align before launch (set trailingSlash or fix sitemap).
- Enrichment (see research-notes.md for sources). Repeatable per state:
  1. [x] EPA LMOP join — `npm run enrich:lmop -- --state <slug> [--dry-run]`
     (download xlsx per header comment in scripts/enrich/lmop.ts first).
     Fills operator + capacity_notes on auto-tier matches only; prints
     review-tier candidates and unmatched-open coverage gaps — always dry-run
     and eyeball before writing. Matcher (scripts/enrich/match.ts, shared for
     all joins) requires 2 shared name tokens or <=0.3mi to auto-match.
     Indiana done 2026-07-30: 21 auto, 11 review (unactioned), 8 open
     landfills we don't list (coverage gaps worth adding).
  2. [ ] IDEM/state permit join (permit_number, permit_status) — reuse match.ts
  3. [ ] Playwright fees/accepted-materials scraper (the moat)
  4. [ ] E-waste collector lists + INDOT/OSM RV dump seeds
- Deploy prereqs: buy domain, `wrangler d1 create wheretodump-db` (+ id into
  wrangler.jsonc), `wrangler r2 bucket create wheretodump-inc-cache`,
  Cloudflare Access app for /admin* + /api/admin* (see Admin review above),
  `wrangler d1 execute wheretodump-db --remote --file=db/schema.sql` + import,
  set NEXT_PUBLIC_SITE_URL. hello@wheretodump.com is referenced on
  submit/about/privacy/terms — create the mailbox or change the address.

## URL structure

- `/` — Home
- `/[stateSlug]/` — State page
- `/[stateSlug]/county/[countySlug]/` — County page (findadump has none — key edge)
- `/[stateSlug]/[citySlug]/` — City page
- `/[stateSlug]/[citySlug]/[locationSlug]/` — Facility detail
- `/[stateSlug]/category/[categorySlug]/` — e.g. /texas/category/e-waste/
- `/near-me/` — Geolocation finder (client-side)
- `/rv-dump-stations/...` — RV section (separate audience, affiliate potential)
- `/guides/...` — MDX guides
- `/submit/` — Submit a facility

## Facility data model (beyond the Outscraper basics)

The moat fields — populate before launching a state, not after:
- `accepted_materials` (jsonb): household, construction, yard, e-waste, hazmat,
  tires, appliances, scrap metal...
- `fees` (jsonb): per-load / per-ton / free-for-residents, cash/card
- `residency_restriction`: county/city residents only?
- `permit_number`, `permit_status`, `operator`, `capacity` (from EPA LMOP + state
  permit DBs — see research-notes.md for sources)
- `facility_type`: landfill | transfer_station | recycling_center | e_waste |
  scrap_metal | rv_dump

## Data Pipeline

- Outscraper CSV exports (web UI, no API key) → import script → D1
- EPA LMOP Excel + state permit lists (CA/TX/NY first) → enrichment join by
  name+geo
- Playwright scraper for fees/accepted-materials from facility websites (adapt
  farm-directory/scripts/verify-farms.ts)
- Pilot state first with full depth, then state-by-state rollout. Never mass-launch
  shallow pages (GoFarmHop lesson).

## Guides / SEO Content

Same MDX pipeline as the sisters (build-time precompilation, no runtime fs).
Voice: practical, direct, a little dry-humored — the audience is someone with a
truckload of junk asking "where can I take this and what will it cost." Answer
fast, no filler, no AI phrases ("let's dive in"), no emojis, and NO emdashes
anywhere in user-visible content (titles, descriptions, page copy, FAQ text,
guides). Use a period, comma, colon, or "like ... and ..." instead. Vary
sentence rhythm so nothing reads machine-written.
Guide ideas: "Can you take a mattress to the dump?", "Dump fees explained",
"E-waste disposal by state", "RV dump station etiquette".
