/**
 * Ohio EPA permit enrichment: join the DMWM "All Regulated" layer (fetched to
 * enrichment-data/ohio-epa-facilities.geojson by the discovery pass) to our
 * Ohio facilities and fill permit_number + permit_status.
 *
 * Source layer:
 *   https://geo.epa.ohio.gov/arcgis/rest/services/WasteMgmt/DMWM/MapServer/1/query?where=1=1&outFields=*&f=geojson
 * Refresh with --refresh. Aliases: db/enrichment-aliases.json "ohio_epa"
 * section, keyed by fp_place_id/secondary_id combo ("placeid_secid").
 *
 * Usage:
 *   npm run enrich:ohio -- --dry-run
 *   npm run enrich:ohio
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { d1Query, d1ExecFile } from '../lib/d1';
import { bestMatch, type MatchTarget } from './match';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');

const LAYER_URL =
  'https://geo.epa.ohio.gov/arcgis/rest/services/WasteMgmt/DMWM/MapServer/1/query?where=1%3D1&outFields=*&f=geojson';
const CACHE_PATH = resolve(root, 'enrichment-data', 'ohio-epa-facilities.geojson');
const ALIASES_PATH = resolve(root, 'db', 'enrichment-aliases.json');
const UPDATE_SQL_PATH = resolve(root, 'db', 'update-ohio-epa.sql');

const dryRun = process.argv.includes('--dry-run');
const refresh = process.argv.includes('--refresh');

// Haulers/mobile operations, not places you drive to
const SKIP_DESC = /transporter|mobile/i;
// Facility categories worth listing individually in the gap report
const GAP_REPORT_PROGRAMS = new Set([
  'Municipal Solid Waste Landfills',
  'Municipal Solid Waste Transfer Facilities',
  'Construction & Demolition Debris (C&DD) Landfills',
]);
const PROGRAM_PRIORITY = [
  'Municipal Solid Waste Landfills',
  'Municipal Solid Waste Transfer Facilities',
  'Construction & Demolition Debris (C&DD) Landfills',
  'C&DD Processing',
];

interface OhioProps {
  placeid_secid: string | null;
  secondary_id: string | null;
  registration_num: string | null;
  place_name: string;
  program_name: string;
  facility_description: string | null;
  license_status: string | null;
  registration_status: string | null;
  county_name: string | null;
  city: string | null;
  dd_lat: number | null;
  dd_lon: number | null;
}

async function loadLayer(): Promise<OhioProps[]> {
  if (refresh || !existsSync(CACHE_PATH)) {
    console.log('Fetching Ohio EPA DMWM layer...');
    const res = await fetch(LAYER_URL);
    if (!res.ok) throw new Error(`Layer fetch failed: HTTP ${res.status}`);
    writeFileSync(CACHE_PATH, await res.text());
  }
  const geo = JSON.parse(readFileSync(CACHE_PATH, 'utf-8')) as {
    features: { properties: OhioProps }[];
  };
  return geo.features.map((f) => f.properties);
}

async function main() {
  const rows = (await loadLayer()).filter(
    (r) => !SKIP_DESC.test(r.facility_description ?? '')
  );
  rows.sort(
    (a, b) =>
      (PROGRAM_PRIORITY.indexOf(a.program_name) + 1 || 99) -
      (PROGRAM_PRIORITY.indexOf(b.program_name) + 1 || 99)
  );
  console.log(`Ohio EPA: ${rows.length} regulated facilities (transporters/mobile excluded)`);

  const aliases: Record<string, string> = existsSync(ALIASES_PATH)
    ? JSON.parse(readFileSync(ALIASES_PATH, 'utf-8')).ohio_epa ?? {}
    : {};

  interface FacilityRow extends MatchTarget {
    place_id: string | null;
  }
  const facilities = d1Query<FacilityRow>(root,
    `SELECT id, place_id, name, lat, lng, county, city FROM facilities
     WHERE state_slug = 'ohio' AND service_only = 0`
  );
  const byPlaceId = new Map(facilities.filter((f) => f.place_id).map((f) => [f.place_id!, f]));
  console.log(`Ours: ${facilities.length} Ohio facilities\n`);

  const updates: { id: number; permit: string; status: string; label: string }[] = [];
  const reviews: string[] = [];
  const gaps: string[] = [];
  const claimed = new Set<number>();

  for (const r of rows) {
    const permit = r.secondary_id ?? r.registration_num;
    if (!permit) continue;
    const licStatus = r.license_status ?? r.registration_status ?? 'regulated';
    const status = `${licStatus === 'ISSUED' ? 'Licensed' : licStatus} (Ohio EPA, ${r.facility_description ?? r.program_name})`;
    const label = `${r.place_name} [${r.program_name}] (${r.county_name ?? '?'} Co., ${permit})`;

    const aliasKey = r.placeid_secid ?? permit;
    const aliased = aliases[aliasKey] ? byPlaceId.get(aliases[aliasKey]) : undefined;
    if (aliased && !claimed.has(aliased.id)) {
      claimed.add(aliased.id);
      updates.push({ id: aliased.id, permit, status, label: `${label} -> ${aliased.name} [alias]` });
      continue;
    }

    const m = bestMatch(
      { name: r.place_name, lat: r.dd_lat, lng: r.dd_lon, county: r.county_name, city: r.city },
      facilities.filter((f) => !claimed.has(f.id))
    );

    if (m?.tier === 'auto') {
      claimed.add(m.target.id);
      updates.push({
        id: m.target.id,
        permit,
        status,
        label: `${label} -> ${m.target.name} [name ${m.nameScore.toFixed(2)}, ${m.distanceMiles?.toFixed(1) ?? '?'}mi]`,
      });
    } else if (m?.tier === 'review') {
      reviews.push(`${label} ~? ${m.target.name} [name ${m.nameScore.toFixed(2)}, ${m.distanceMiles?.toFixed(1) ?? '?'}mi]`);
    } else if (GAP_REPORT_PROGRAMS.has(r.program_name) && (r.license_status === 'ISSUED' || r.registration_status)) {
      gaps.push(label);
    }
  }

  console.log(`AUTO matches (${updates.length}):`);
  for (const u of updates) console.log(`  ${u.label}`);
  console.log(`\nREVIEW candidates (${reviews.length}) — not written:`);
  for (const r of reviews) console.log(`  ${r}`);
  console.log(`\nLicensed landfills/transfer/C&DD with no match (${gaps.length}) — coverage gaps:`);
  for (const g of gaps) console.log(`  ${g}`);

  if (dryRun || updates.length === 0) return;

  const esc = (v: string) => v.replace(/'/g, "''");
  writeFileSync(
    UPDATE_SQL_PATH,
    updates
      .map(
        (u) =>
          `UPDATE facilities SET permit_number = '${esc(u.permit)}', permit_status = '${esc(u.status)}', updated_at = datetime('now') WHERE id = ${u.id};`
      )
      .join('\n') + '\n'
  );
  d1ExecFile(root, UPDATE_SQL_PATH);
  console.log(`\nWrote ${updates.length} facilities to local D1.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
