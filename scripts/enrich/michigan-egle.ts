/**
 * Michigan EGLE enrichment: join the Materials Management Facilities layer
 * (fetched to enrichment-data/michigan-egle-facilities.geojson) to our
 * Michigan facilities and fill permit_number + permit_status.
 *
 * Source: gisagoegle.state.mi.us MmdOpenData/MapServer/0 (all modules:
 * landfills, transfer stations incl. exempt, processing, compost, scrap
 * tire, eWaste). Refresh with --refresh. Aliases: "michigan_egle" section
 * keyed by wdsid.
 *
 * Usage: npm run enrich:michigan [-- --dry-run]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { d1Query, d1ExecFile } from '../lib/d1';
import { bestMatch, type MatchTarget } from './match';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');

const LAYER_URL =
  'https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/MmdOpenData/MapServer/0/query?where=1%3D1&outFields=*&f=geojson';
const CACHE_PATH = resolve(root, 'enrichment-data', 'michigan-egle-facilities.geojson');
const ALIASES_PATH = resolve(root, 'db', 'enrichment-aliases.json');
const UPDATE_SQL_PATH = resolve(root, 'db', 'update-michigan-egle.sql');

const dryRun = process.argv.includes('--dry-run');
const refresh = process.argv.includes('--refresh');

// Closed/administrative records must not stamp live listings
const DEAD_STATUS = /post-closure|beyond/i;
const SKIP_TYPES = /end user|anaerobic digester/i;
const GAP_TYPES = /type ii msw landfill|transfer facility|transfer station/i;
const TYPE_PRIORITY = ['Type II MSW Landfill', 'Solid Waste Transfer Facility', 'Solid Waste Transfer Facility - Exempt', 'Solid Waste Processing Plant'];

interface MiProps {
  wdsid: number;
  legalsitename: string | null;
  specificsitename: string | null;
  facilitytype: string;
  city: string | null;
  countyname: string | null;
  latdeccord: string | null;
  longdeccord: string | null;
  disposalareastatus: string | null;
}

async function loadLayer(): Promise<MiProps[]> {
  if (refresh || !existsSync(CACHE_PATH)) {
    console.log('Fetching EGLE layer...');
    const res = await fetch(LAYER_URL);
    if (!res.ok) throw new Error(`Layer fetch failed: HTTP ${res.status}`);
    writeFileSync(CACHE_PATH, await res.text());
  }
  const geo = JSON.parse(readFileSync(CACHE_PATH, 'utf-8')) as { features: { properties: MiProps }[] };
  return geo.features.map((f) => f.properties);
}

async function main() {
  const rows = (await loadLayer()).filter(
    (r) =>
      !SKIP_TYPES.test(r.facilitytype ?? '') &&
      !DEAD_STATUS.test(r.disposalareastatus ?? '')
  );
  rows.sort(
    (a, b) =>
      (TYPE_PRIORITY.indexOf(a.facilitytype) + 1 || 99) -
      (TYPE_PRIORITY.indexOf(b.facilitytype) + 1 || 99)
  );
  console.log(`EGLE: ${rows.length} live facilities (post-closure/administrative excluded)`);

  const aliases: Record<string, string> = existsSync(ALIASES_PATH)
    ? JSON.parse(readFileSync(ALIASES_PATH, 'utf-8')).michigan_egle ?? {}
    : {};

  interface FacilityRow extends MatchTarget {
    place_id: string | null;
  }
  const facilities = d1Query<FacilityRow>(root,
    `SELECT id, place_id, name, lat, lng, county, city FROM facilities
     WHERE state_slug = 'michigan' AND service_only = 0`
  );
  const byPlaceId = new Map(facilities.filter((f) => f.place_id).map((f) => [f.place_id!, f]));
  console.log(`Ours: ${facilities.length} Michigan facilities\n`);

  const updates: { id: number; permit: string; status: string; label: string }[] = [];
  const reviews: string[] = [];
  const gaps: string[] = [];
  const claimed = new Set<number>();

  for (const r of rows) {
    const name = r.specificsitename ?? r.legalsitename;
    if (!name) continue;
    const permit = `EGLE ${r.wdsid}`;
    const status = `${r.disposalareastatus ?? 'Registered'} (Michigan EGLE, ${r.facilitytype})`;
    const label = `${name} [${r.facilitytype}] (${r.countyname ?? '?'} Co., ${r.wdsid})`;

    const aliased = aliases[String(r.wdsid)] ? byPlaceId.get(aliases[String(r.wdsid)]) : undefined;
    if (aliased && !claimed.has(aliased.id)) {
      claimed.add(aliased.id);
      updates.push({ id: aliased.id, permit, status, label: `${label} -> ${aliased.name} [alias]` });
      continue;
    }

    const m = bestMatch(
      {
        name,
        lat: r.latdeccord ? Number(r.latdeccord) : null,
        lng: r.longdeccord ? Number(r.longdeccord) : null,
        county: r.countyname,
        city: r.city,
      },
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
    } else if (GAP_TYPES.test(r.facilitytype) && /active/i.test(r.disposalareastatus ?? '')) {
      gaps.push(label);
    }
  }

  console.log(`AUTO matches (${updates.length}):`);
  for (const u of updates) console.log(`  ${u.label}`);
  console.log(`\nREVIEW candidates (${reviews.length}) — not written:`);
  for (const r of reviews) console.log(`  ${r}`);
  console.log(`\nActive landfills/transfer stations with no match (${gaps.length}) — coverage gaps:`);
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
