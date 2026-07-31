/**
 * Automated Outscraper ingest — replaces the manual web-UI export step used on
 * the sister sites.
 *
 * 1. Builds category queries for a state (see classify.ts CATEGORY_QUERIES)
 * 2. Submits them to the Outscraper API and polls until complete
 * 3. Dedupes by place_id across queries
 * 4. Classifies facility_type + flags service-only businesses (haulers etc.)
 * 5. Writes outscraper-data/{state}-raw.json and {state}-facilities.json
 *    and prints a coverage report
 *
 * Does NOT load into D1 — that happens in a later import step once the schema
 * exists. Never sets any approval status (manual-only rule).
 *
 * Usage:
 *   npm run ingest -- --state indiana --test          # 1 query x 5 results (~free) to validate the key
 *   npm run ingest -- --state indiana --dry-run       # print queries + cost estimate, no API call
 *   npm run ingest -- --state indiana                 # full run, default 400/query
 *   npm run ingest -- --state indiana --limit 250
 *   npm run ingest -- --state indiana --categories landfill,transfer_station
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { searchMaps, type OutscraperPlace } from './outscraper';
import { CATEGORY_QUERIES, classify, type ClassifiedPlace, type FacilityType } from './classify';
import { loadEnvLocal } from '../lib/env';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');

loadEnvLocal(root);

// ─── Args ─────────────────────────────────────────────────────
function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const stateArg = argValue('--state');
const dryRun = process.argv.includes('--dry-run');
const testMode = process.argv.includes('--test');
const byCounty = process.argv.includes('--by-county');
const limitPerQuery = testMode ? 5 : Number(argValue('--limit') ?? (byCounty ? 50 : 400));
const categoriesArg = argValue('--categories');

if (!stateArg) {
  console.error(
    'Usage: npm run ingest -- --state indiana [--test|--dry-run|--by-county] [--limit N] [--categories a,b]'
  );
  process.exit(1);
}
const stateName = stateArg
  .split(/[-_ ]/)
  .map((w) => w[0].toUpperCase() + w.slice(1))
  .join(' ');

// ─── Build queries ────────────────────────────────────────────
const selectedCategories = (
  categoriesArg ? categoriesArg.split(',') : Object.keys(CATEGORY_QUERIES)
) as Array<keyof typeof CATEGORY_QUERIES>;

for (const c of selectedCategories) {
  if (!(c in CATEGORY_QUERIES)) {
    console.error(`Unknown category "${c}". Valid: ${Object.keys(CATEGORY_QUERIES).join(', ')}`);
    process.exit(1);
  }
}

/**
 * County fan-out: state-level queries only return what a Google search box
 * shows (top results), so smaller facility types under-fetch badly. Per-county
 * queries with the primary phrase per category give an exhaustive mesh.
 */
const COUNTY_FANOUT_CATEGORIES: Array<keyof typeof CATEGORY_QUERIES> = [
  'landfill',
  'transfer_station',
  'recycling_center',
  'hazardous_waste',
];

async function buildQueries(): Promise<string[]> {
  if (!byCounty) {
    return selectedCategories.flatMap((cat) =>
      CATEGORY_QUERIES[cat].map((phrase) => `${phrase}, ${stateName}, USA`)
    );
  }
  const { fetchCounties } = await import('./counties');
  const counties = await fetchCounties(stateName);
  const cats = categoriesArg ? selectedCategories : COUNTY_FANOUT_CATEGORIES;
  console.log(`County fan-out: ${counties.length} counties × ${cats.length} categories`);
  return counties.flatMap((county) =>
    cats.map((cat) => `${CATEGORY_QUERIES[cat][0]}, ${county}, ${stateName}, USA`)
  );
}

// ─── Run ──────────────────────────────────────────────────────
async function main() {
let queries = await buildQueries();
if (testMode) queries = queries.slice(0, 1);

console.log(`\nIngest: ${stateName} — ${queries.length} queries, limit ${limitPerQuery}/query`);
if (queries.length <= 20) for (const q of queries) console.log(`  • ${q}`);
else console.log(`  • ${queries[0]}\n  • ${queries[1]}\n  … ${queries.length - 2} more`);
const maxRecords = queries.length * limitPerQuery;
console.log(
  `Max records if every query maxed out: ${maxRecords} — real billing is unique records only (Indiana state pass billed 306 ≈ $0.92)\n`
);

if (dryRun) {
  console.log('Dry run — no API call made.');
  process.exit(0);
}

// Chunk large query sets into multiple API requests.
// Queries ride in the GET URL, so the chunk size is capped by URL length —
// 250 blew past it (HTTP rejection on the Illinois fan-out). 50 is proven;
// the cross-chunk duplicate billing (~60% overhead) is the cost of the API
// shape, not something to optimize away here.
const CHUNK_SIZE = 50;
const results: OutscraperPlace[][] = [];
for (let i = 0; i < queries.length; i += CHUNK_SIZE) {
  const chunk = queries.slice(i, i + CHUNK_SIZE);
  console.log(`Chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(queries.length / CHUNK_SIZE)} (${chunk.length} queries)`);
  results.push(...(await searchMaps(chunk, { limitPerQuery })));
}

// Dedupe across queries by place_id, remembering every query that found the
// place. Attribution comes from each record's own `query` field — with
// dropDuplicates the API may merge all queries into one array, so the position
// in `results` is not reliable. Drop out-of-state leakage.
const byPlaceId = new Map<string, { place: OutscraperPlace; sourceQueries: string[] }>();
const queryCounter = new Map<string, number>();
let outOfState = 0;
results.forEach((places, i) => {
  for (const place of places) {
    if (!place.place_id) continue;
    const sourceQuery = (place.query as string | undefined) ?? queries[i];
    queryCounter.set(sourceQuery, (queryCounter.get(sourceQuery) ?? 0) + 1);
    if (place.state && place.state.toLowerCase() !== stateName.toLowerCase()) {
      outOfState++;
      continue;
    }
    const existing = byPlaceId.get(place.place_id);
    if (existing) existing.sourceQueries.push(sourceQuery);
    else byPlaceId.set(place.place_id, { place, sourceQueries: [sourceQuery] });
  }
});
const perQueryCounts = [...queryCounter.entries()]
  .map(([query, count]) => ({ query, count }))
  .sort((a, b) => b.count - a.count);

const classified: ClassifiedPlace[] = [...byPlaceId.values()].map(({ place, sourceQueries }) =>
  classify(place, sourceQueries)
);

// ─── Write output ─────────────────────────────────────────────
const outDir = resolve(root, 'outscraper-data');
mkdirSync(outDir, { recursive: true });
const slug = stateArg!.toLowerCase().replace(/[_ ]/g, '-') + (byCounty ? '-county' : '');
const rawPath = resolve(outDir, `${slug}-raw.json`);
const outPath = resolve(outDir, `${slug}-facilities.json`);
writeFileSync(rawPath, JSON.stringify(results, null, 2));
writeFileSync(outPath, JSON.stringify(classified, null, 2));

// ─── Report ───────────────────────────────────────────────────
const total = classified.length;
const totalRaw = perQueryCounts.reduce((s, q) => s + q.count, 0);
const byType = new Map<FacilityType, number>();
let serviceOnly = 0;
let noWebsite = 0;
let noHours = 0;
for (const p of classified) {
  byType.set(p.facility_type, (byType.get(p.facility_type) ?? 0) + 1);
  if (p.service_only) serviceOnly++;
  if (!p.website) noWebsite++;
  if (!p.working_hours || Object.keys(p.working_hours).length === 0) noHours++;
}

console.log('\n─── Coverage report ─────────────────────────');
for (const { query, count } of perQueryCounts) console.log(`${String(count).padStart(5)}  ${query}`);
console.log(
  `\nRaw results: ${totalRaw} → unique in-state places: ${total} (${outOfState} out-of-state dropped, ${totalRaw - outOfState - total} cross-query dupes)`
);
console.log('\nBy facility type:');
for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${String(count).padStart(5)}  ${type}`);
}
console.log(`\nFlagged service-only (haulers/rentals — likely not drop-offs): ${serviceOnly}`);
console.log(`Missing website: ${noWebsite}/${total} · Missing hours: ${noHours}/${total}`);
console.log(`\nWrote ${outPath}`);
console.log(`Wrote ${rawPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
