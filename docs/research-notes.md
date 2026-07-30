# Where To Dump — Niche Research & Scoping (2026-07-29)

Directory site for waste disposal facilities: landfills, transfer stations,
recycling centers, e-waste dropoff, scrap metal disposal, RV dump stations.
Goal: $1,000+/mo. Monetization constraint: passive only — display ads, affiliate,
self-serve featured listings. No sales/outreach.

## Why this niche won

Evaluated ~30 directory niches across family/parent amenities and high-RPM
commercial verticals. Killed: pickleball (Pickleheads + USA Pickleball), EV charging
(PlugShare, app-first), storage (SpareFoot), laundromats (4+ programmatic clones),
med spas (YMYL risk), notaries, shooting ranges (NSSF wheretoshoot.org), propane
(brand locators), farmers markets (USDA/LocalHarvest), disc golf (UDisc), drive-ins
(too few venues), dog parks (BringFido). Runner-up: dog daycare/boarding facilities
(pet RPMs $25-50, Rover absent from facility queries — viable future site).

Dump won on: biggest volume, weakest competition, above-average ad bids, perfect
fit for the state/county/city programmatic playbook.

## Keyword validation (three sources, 2026-07-29)

WordStream (Google Ads data), all Low competition unless noted:

| Keyword | Volume/mo | Top-of-page bid |
|---|---|---|
| dump near me | 301,000 | $2.12–$9.80 |
| landfill near me | 201,000 | $2.13–$9.94 |
| trash dump near me | 90,500 | $1.96–$7.80 |
| metal disposal near me | 90,500 | $0.59–$3.05 |
| electronic disposal near me | 74,000 (Medium) | $0.60–$4.22 |
| rv dump station near me | 74,000 | $1.15–$3.38 |

Ahrefs free tool: 44,555 "landfill" variants, 16,104 "transfer station" variants,
1,090 "dump near me" variants. Head terms mostly Easy KD. Long tail is
facility-name queries ("renton transfer station" >1K/mo Easy, "davidson county
landfill" >1K) — exactly what per-listing and county pages capture.

Google Trends 5y: dead stable, mild summer peak, ~5–6x the interest of
"dog daycare near me", even spread across all states.

## Competitor: findadump.com

- ~289 organic visits/mo (Ahrefs 2026-07), traffic value $457, launched ~early
  2026, ramping since May. Astro static site on Vercel, plain AdSense.
- 6,997 pages: 50 states + facilities directly under /state/facility-slug/.
- Already ranks: pos 8 "nearest dump near me", 11 "where can i dump my trash for
  free", 13 "waste dump near me", 21 "dump" (26K/mo). Proof the SERP is crackable
  by a young thin site.
- Exploitable gaps: NO county/city pages (whole Easy query layer uncontested),
  messy duplicate slugs (advanced-disposal-1..5 — raw unclean scrape), no fees or
  accepted-materials data, no e-waste/metal/RV categories, AdSense-only.

Other SERP occupants: city/county .gov pages (each only covers its own facility),
WM.com/wasteconnections.com locators. No entrenched national player.

## Data sources

Google Maps via Outscraper (categories: transfer station, landfill, recycling
center, RV dump station). NOTE: no Outscraper API key in env — prior imports were
CSV exports from the Outscraper web UI.

Differentiation data (what .gov buries and nobody structures):
- **EPA LMOP**: ~2,600 MSW landfills, free Excel. Capacity, waste-in-place,
  open/close years, operator, lat/lon. Join to Outscraper by name+geo.
  https://www.epa.gov/lmop/landfill-technical-data
- **State permit DBs** (start with these 3 — clean structured downloads):
  - CA CalRecycle SWIS (refreshed 3x/week, permit#, status, capacity)
  - TX TCEQ MSW dataset (Excel)
  - NY data.ny.gov Solid Waste Management Facilities (CSV/JSON API, has a
    dedicated transfer-stations subset)
  - PA publishes per-facility quarterly tonnage (unusual, good trust content).
  Every state DEP/DEQ has a permitted-facility list; expect 50-state ETL patchwork.
- **Fees + accepted materials: no open dataset anywhere.** Playwright scraping of
  facility/county sites (same pattern as farm-directory verify-farms.ts). This is
  the moat and the answer to "what can I bring / what does it cost" queries.
- RV dumps: sanidumps.com (~17k listings, dated UX, community data — incumbent not
  source). OSM `amenity=sanitary_dump_station` (ODbL) to seed.
- E-waste: Earth911 API is commercial (don't scrape); ~25 states publish
  registered-collector lists (NY, CA CEW directory, MN PCA, WA E-Cycle).

## Page inventory target

~1,540 active MSW landfills (2,600 incl. closed), ~2,000–2,500 transfer stations,
~300–400 MRFs + tens of thousands of drop-off/scrap locations (curate), ~15–17k RV
dump stations. Realistic v1: 8–12k facility pages + ~3,100 county pages + 50 state
pages. County pages from day one — findadump doesn't have them.

## Monetization economics (research-backed)

- Ezoic local-content EPMV runs $4–6 → $1k/mo needs 170–250k visits. Mediavine
  Journey (10k sessions gate) roughly 2x; full Mediavine (50k sessions) 4–8x vs
  Ezoic (verified: same content $6.92 EPMV Ezoic vs $54 RPM Mediavine).
- Junk-removal/dumpster-rental advertisers bid $2–10 top-of-page → display RPM
  should land well above splash pad rates.
- Hometown Dumpster Rental model proves the advertiser pool (2M visits/yr business
  on this exact adjacency; leads sell $15–27).
- Self-serve featured tier possible later for private facilities/scrap yards.
  RV-affiliate content on the RV dump section.
- Path: Ezoic at launch → Journey at 10k sessions → Mediavine at 50k.

## Launch strategy (GoFarmHop lesson)

GoFarmHop's traffic cliffed to ~zero around 2026-05-22 after an April/May ramp —
technicals were clean; likely new-site honeymoon reassessment of thin programmatic
pages (1,588 farms / 10 states at the time), possibly amplified by SEO gaps (soft
404s, no canonicals, no LocalBusiness JSON-LD — see fork-review.md).

Therefore: launch pilot state(s) with FULL depth (fees, accepted materials, permit
data, hours) rather than 50 shallow states. Roll out state-by-state. Ship the SEO
layer (JSON-LD, canonicals, OG, real 404s) from day one.

## Domains (checked 2026-07-29, whois)

Available: wheretodump.com (pick — mirrors query language), dumpnearby.com
(runner-up), finddumps.com, trashdropoff.com, localdumpfinder.com.
Taken: dumpfinder.com, dumplocator.com, disposalfinder.com, godumpit.com,
dumpstationfinder.com.
