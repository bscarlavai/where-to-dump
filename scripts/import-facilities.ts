/**
 * Import a classified+county-backfilled facilities JSON into D1.
 *
 * Generates db/import-{state}.sql (states, counties, cities, facilities) and
 * optionally executes it against local D1 via wrangler.
 *
 * Idempotent: INSERT OR IGNORE everywhere; facilities conflict on place_id.
 * Never sets status beyond 'imported' — approval is manual in admin.
 *
 * Usage:
 *   npx tsx scripts/import-facilities.ts outscraper-data/indiana-merged-facilities.json --state indiana
 *   npx tsx scripts/import-facilities.ts ... --state indiana --execute   # also runs wrangler d1 execute --local
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ClassifiedPlace } from './ingest/classify';
import { cleanWebsiteUrl } from '../src/lib/utils/url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const STATE_ABBRS: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY',
};

const fileArg = process.argv[2];
const stateArgIdx = process.argv.indexOf('--state');
const stateArg = stateArgIdx !== -1 ? process.argv[stateArgIdx + 1] : undefined;
const execute = process.argv.includes('--execute');

if (!fileArg || !stateArg) {
  console.error('Usage: npx tsx scripts/import-facilities.ts <facilities.json> --state indiana [--execute]');
  process.exit(1);
}

const stateSlug = stateArg.toLowerCase().replace(/[_ ]/g, '-');
const stateName = stateSlug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const stateAbbr = STATE_ABBRS[stateName.toLowerCase()];
if (!stateAbbr) {
  console.error(`Unknown state: ${stateName}`);
  process.exit(1);
}

const places: ClassifiedPlace[] = JSON.parse(readFileSync(resolve(fileArg), 'utf-8'));

// cf_image_id by place_id, maintained by scripts/images/upload-photos.ts —
// lets rebuilds and the remote import carry already-uploaded images
const cfImagesMapPath = resolve(root, 'outscraper-data', 'cf-images-map.json');
const cfImagesMap: Record<string, string> = existsSync(cfImagesMapPath)
  ? JSON.parse(readFileSync(cfImagesMapPath, 'utf-8'))
  : {};

const toSlug = (s: string) =>
  s.toLowerCase()
    .replace(/[™®']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const q = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};
const qj = (v: unknown): string => (v == null ? 'NULL' : q(JSON.stringify(v)));

// ─── Build rows ───────────────────────────────────────────────
const counties = new Map<string, string>(); // slug -> name
const cities = new Map<string, { name: string; countySlug: string | null }>(); // slug -> info
const usedFacilitySlugs = new Map<string, number>(); // citySlug/slug collision counter

interface FacilityRow extends ClassifiedPlace {
  _slug: string;
  _citySlug: string;
  _countySlug: string | null;
}
const rows: FacilityRow[] = [];
let skippedNoCity = 0;

for (const p of places) {
  const cityName = p.city;
  if (!cityName || !p.name) {
    skippedNoCity++;
    continue;
  }
  const citySlug = toSlug(cityName);
  const countyName = p.county ?? null;
  const countySlug = countyName ? toSlug(countyName) : null;
  if (countyName && countySlug && !counties.has(countySlug)) counties.set(countySlug, countyName);
  if (!cities.has(citySlug)) cities.set(citySlug, { name: cityName, countySlug });

  let slug = toSlug(p.name);
  const key = `${citySlug}/${slug}`;
  const n = usedFacilitySlugs.get(key) ?? 0;
  usedFacilitySlugs.set(key, n + 1);
  if (n > 0) slug = `${slug}-${n + 1}`;

  rows.push({ ...p, _slug: slug, _citySlug: citySlug, _countySlug: countySlug });
}

// ─── Generate SQL ─────────────────────────────────────────────
const sql: string[] = [];
sql.push(`INSERT OR IGNORE INTO states (name, abbr, slug) VALUES (${q(stateName)}, ${q(stateAbbr)}, ${q(stateSlug)});`);

for (const [slug, name] of counties) {
  sql.push(
    `INSERT OR IGNORE INTO counties (state_id, name, slug) VALUES ((SELECT id FROM states WHERE slug=${q(stateSlug)}), ${q(name)}, ${q(slug)});`
  );
}
for (const [slug, { name, countySlug }] of cities) {
  const countyRef = countySlug
    ? `(SELECT id FROM counties WHERE slug=${q(countySlug)} AND state_id=(SELECT id FROM states WHERE slug=${q(stateSlug)}))`
    : 'NULL';
  sql.push(
    `INSERT OR IGNORE INTO cities (state_id, county_id, name, slug) VALUES ((SELECT id FROM states WHERE slug=${q(stateSlug)}), ${countyRef}, ${q(name)}, ${q(slug)});`
  );
}

for (const r of rows) {
  const countyRef = r._countySlug
    ? `(SELECT id FROM counties WHERE slug=${q(r._countySlug)} AND state_id=(SELECT id FROM states WHERE slug=${q(stateSlug)}))`
    : 'NULL';
  sql.push(`INSERT OR IGNORE INTO facilities (
    place_id, state_slug, city_slug, slug,
    state_id, county_id, city_id,
    name, facility_type, secondary_types, service_only,
    street, city, state, state_abbr, zip, county, lat, lng, time_zone,
    phone, website, google_maps_url,
    google_rating, google_review_count, google_business_status, google_primary_type,
    google_types, google_hours, about, description, photo_url, photos_count, cf_image_id,
    source_queries
  ) VALUES (
    ${q(r.place_id)}, ${q(stateSlug)}, ${q(r._citySlug)}, ${q(r._slug)},
    (SELECT id FROM states WHERE slug=${q(stateSlug)}), ${countyRef},
    (SELECT id FROM cities WHERE slug=${q(r._citySlug)} AND state_id=(SELECT id FROM states WHERE slug=${q(stateSlug)})),
    ${q(r.name)}, ${q(r.facility_type)}, ${qj(r.subtypes ? String(r.subtypes).split(', ') : [])}, ${r.service_only ? 1 : 0},
    ${q(r.street)}, ${q(r.city)}, ${q(stateName)}, ${q(stateAbbr)}, ${q(r.postal_code)}, ${q(r.county)}, ${q(r.latitude)}, ${q(r.longitude)}, ${q(r.time_zone)},
    ${q(r.phone)}, ${q(cleanWebsiteUrl(r.website))}, ${q(r.location_link)},
    ${q(r.rating)}, ${q(r.reviews ?? 0)}, ${q(r.business_status)}, ${q(r.type)},
    ${qj(r.subtypes ?? null)}, ${qj(r.working_hours ?? null)}, ${qj(r.about ?? null)}, ${q(r.description)}, ${q(r.photo)}, ${q(r.photos_count ?? 0)}, ${q(r.place_id ? cfImagesMap[r.place_id] ?? null : null)},
    ${qj(r.source_queries)}
  );`);
}

const outPath = resolve(root, 'db', `import-${stateSlug}.sql`);
writeFileSync(outPath, sql.join('\n'));
console.log(`${rows.length} facilities (${skippedNoCity} skipped, no city), ${counties.size} counties, ${cities.size} cities`);
console.log(`Wrote ${outPath}`);

if (execute) {
  console.log('\nApplying schema + import to local D1...');
  execSync(`npx wrangler d1 execute wheretodump-db --local --file=db/schema.sql`, { cwd: root, stdio: 'inherit' });
  execSync(`npx wrangler d1 execute wheretodump-db --local --file=db/import-${stateSlug}.sql`, { cwd: root, stdio: 'inherit' });
}
