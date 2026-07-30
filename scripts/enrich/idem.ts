/**
 * IDEM permit enrichment (Indiana): join the state's "Authorized Operating
 * Solid Waste Facilities" layer (IndianaMap/ArcGIS, IDEM Office of Land
 * Quality) to our facilities and fill permit_number + permit_status.
 *
 * The layer only lists currently authorized facilities, so matched records
 * get permit_status "Authorized". Also reports authorized landfills/transfer
 * stations we don't list (coverage gaps for a targeted ingest).
 *
 * Fetches the GeoJSON directly (free, no auth) and caches it in
 * enrichment-data/. Aliases: db/enrichment-aliases.json "idem" section,
 * keyed by master_ai_id.
 *
 * Usage:
 *   npm run enrich:idem -- --dry-run
 *   npm run enrich:idem
 *   npm run enrich:idem -- --refresh   # re-download the layer
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { d1Query, d1ExecFile } from '../lib/d1';
import { bestMatch, type MatchTarget } from './match';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');

const LAYER_URL =
  'https://gisdata.in.gov/server/rest/services/Hosted/Authorized_Operating_Solid_Waste_Facilities/FeatureServer/2120/query?where=1%3D1&outFields=*&outSR=4326&f=geojson';
const CACHE_PATH = resolve(root, 'enrichment-data', 'idem-facilities.geojson');
const ALIASES_PATH = resolve(root, 'db', 'enrichment-aliases.json');
const UPDATE_SQL_PATH = resolve(root, 'db', 'update-idem.sql');

const dryRun = process.argv.includes('--dry-run');
const refresh = process.argv.includes('--refresh');

// Businesses you call, not places you drive to — no join value
const SKIP_TYPES = new Set(['Waste Tire Transporter']);
// Facility types worth listing individually in the gap report
const GAP_REPORT_TYPES = new Set([
  'Municipal Solid Waste Landfill',
  'Non-Municipal Solid Waste Landfill',
  'Transfer Station',
  'Material Recovery Facility',
  'Construction/Demolition Site',
]);
// Match priority: important site types claim facilities first
const TYPE_PRIORITY = [
  'Municipal Solid Waste Landfill',
  'Non-Municipal Solid Waste Landfill',
  'Transfer Station',
  'Material Recovery Facility',
  'Construction/Demolition Site',
];

interface IdemProps {
  master_ai_id: number;
  sw_program_id: string | null;
  facility_type: string;
  facility_name: string;
  county: string | null;
  facility_city: string | null;
  x_coord: number | null;
  y_coord: number | null;
}

async function loadLayer(): Promise<IdemProps[]> {
  if (refresh || !existsSync(CACHE_PATH)) {
    console.log('Fetching IDEM layer from IndianaMap...');
    const res = await fetch(LAYER_URL);
    if (!res.ok) throw new Error(`Layer fetch failed: HTTP ${res.status}`);
    writeFileSync(CACHE_PATH, await res.text());
  }
  const geo = JSON.parse(readFileSync(CACHE_PATH, 'utf-8')) as {
    features: { properties: IdemProps }[];
  };
  return geo.features.map((f) => f.properties);
}

async function main() {
  const rows = (await loadLayer()).filter((r) => !SKIP_TYPES.has(r.facility_type));
  rows.sort(
    (a, b) =>
      (TYPE_PRIORITY.indexOf(a.facility_type) + 1 || 99) -
      (TYPE_PRIORITY.indexOf(b.facility_type) + 1 || 99)
  );
  console.log(`IDEM: ${rows.length} authorized facilities (transporters excluded)`);

  const aliases: Record<string, string> = existsSync(ALIASES_PATH)
    ? JSON.parse(readFileSync(ALIASES_PATH, 'utf-8')).idem ?? {}
    : {};

  interface FacilityRow extends MatchTarget {
    place_id: string | null;
  }
  const facilities = d1Query<FacilityRow>(root,
    `SELECT id, place_id, name, lat, lng, county, city FROM facilities
     WHERE state_slug = 'indiana' AND service_only = 0`
  );
  const byPlaceId = new Map(facilities.filter((f) => f.place_id).map((f) => [f.place_id!, f]));
  console.log(`Ours: ${facilities.length} Indiana facilities\n`);

  const updates: { id: number; permit: string; status: string; label: string }[] = [];
  const reviews: string[] = [];
  const gaps: string[] = [];
  const claimed = new Set<number>();

  for (const r of rows) {
    const label = `${r.facility_name} [${r.facility_type}] (${r.county ?? '?'} Co., permit ${r.sw_program_id ?? '?'})`;
    const status = `Authorized (IDEM ${r.facility_type})`;

    const aliased = aliases[String(r.master_ai_id)]
      ? byPlaceId.get(aliases[String(r.master_ai_id)])
      : undefined;
    if (aliased && !claimed.has(aliased.id)) {
      claimed.add(aliased.id);
      updates.push({ id: aliased.id, permit: r.sw_program_id ?? '', status, label: `${label} -> ${aliased.name} [alias]` });
      continue;
    }

    const m = bestMatch(
      { name: r.facility_name, lat: r.y_coord, lng: r.x_coord, county: r.county, city: r.facility_city },
      facilities.filter((f) => !claimed.has(f.id))
    );

    if (m?.tier === 'auto' && r.sw_program_id) {
      claimed.add(m.target.id);
      updates.push({
        id: m.target.id,
        permit: r.sw_program_id,
        status,
        label: `${label} -> ${m.target.name} [name ${m.nameScore.toFixed(2)}, ${m.distanceMiles?.toFixed(1) ?? '?'}mi]`,
      });
    } else if (m?.tier === 'review') {
      reviews.push(`${label} ~? ${m.target.name} [name ${m.nameScore.toFixed(2)}, ${m.distanceMiles?.toFixed(1) ?? '?'}mi]`);
    } else if (GAP_REPORT_TYPES.has(r.facility_type)) {
      gaps.push(label);
    }
  }

  console.log(`AUTO matches (${updates.length}):`);
  for (const u of updates) console.log(`  ${u.label}`);
  console.log(`\nREVIEW candidates (${reviews.length}) — not written:`);
  for (const r of reviews) console.log(`  ${r}`);
  console.log(`\nAuthorized landfill/transfer/MRF/C&D sites with no match (${gaps.length}) — coverage gaps:`);
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
