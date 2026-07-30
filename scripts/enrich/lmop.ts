/**
 * EPA LMOP enrichment: join the LMOP landfill database to our facilities and
 * fill operator + capacity_notes. Repeatable per state; never touches status.
 *
 * Source: https://www.epa.gov/lmop/landfill-technical-data
 *   curl -L -o enrichment-data/lmop.xlsx \
 *     https://www.epa.gov/system/files/documents/2024-09/lmopdata.xlsx
 *
 * Usage:
 *   npm run enrich:lmop -- --state indiana --dry-run   # matches + gaps, no writes
 *   npm run enrich:lmop -- --state indiana             # write auto-tier to local D1
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { d1Query, d1ExecFile } from '../lib/d1';
import { bestMatch, type MatchTarget } from './match';
import { SLUG_TO_ABBR } from '../../src/lib/utils/states';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');

const XLSX_PATH = resolve(root, 'enrichment-data', 'lmop.xlsx');
const UPDATE_SQL_PATH = resolve(root, 'db', 'update-lmop.sql');

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const stateSlug = argValue('--state')?.toLowerCase().replace(/[_ ]/g, '-');
const dryRun = process.argv.includes('--dry-run');

if (!stateSlug || !SLUG_TO_ABBR[stateSlug]) {
  console.error('Usage: npm run enrich:lmop -- --state indiana [--dry-run]');
  process.exit(1);
}
if (!existsSync(XLSX_PATH)) {
  console.error(`Missing ${XLSX_PATH} — download it first (see header comment).`);
  process.exit(1);
}
const stateAbbr = SLUG_TO_ABBR[stateSlug];

// ─── Load LMOP rows for the state (dedupe: one row per Landfill ID) ───
interface LmopRow {
  'Landfill ID': number;
  'Landfill Name': string;
  State: string;
  City: string | null;
  County: string | null;
  Latitude: number | null;
  Longitude: number | null;
  'Ownership Type': string | null;
  'Landfill Owner Organization(s)': string | null;
  'Year Landfill Opened': number | null;
  'Landfill Closure Year': number | null;
  'Current Landfill Status': string | null;
  'Waste in Place (tons)': number | null;
  'Waste in Place Year': number | null;
}

const wb = XLSX.read(readFileSync(XLSX_PATH));
const all = XLSX.utils.sheet_to_json<LmopRow>(wb.Sheets['LMOP Database']);
const byId = new Map<number, LmopRow>();
for (const row of all) {
  if (row.State === stateAbbr && !byId.has(row['Landfill ID'])) {
    byId.set(row['Landfill ID'], row);
  }
}
const lmop = [...byId.values()];
console.log(`LMOP: ${lmop.length} ${stateAbbr} landfills (${lmop.filter((r) => r['Current Landfill Status'] === 'Open').length} open)`);

// ─── Hand-verified aliases (LMOP Landfill ID -> place_id) ────
const ALIASES_PATH = resolve(root, 'db', 'enrichment-aliases.json');
const aliases: Record<string, string> = existsSync(ALIASES_PATH)
  ? JSON.parse(readFileSync(ALIASES_PATH, 'utf-8')).lmop ?? {}
  : {};

// ─── Load our facilities ─────────────────────────────────────
interface FacilityRow extends MatchTarget {
  place_id: string | null;
  facility_type: string;
  operator: string | null;
  capacity_notes: string | null;
}
const facilities = d1Query<FacilityRow>(root,
  `SELECT id, place_id, name, lat, lng, county, facility_type, operator, capacity_notes
   FROM facilities
   WHERE state_slug = '${stateSlug}' AND service_only = 0
     AND facility_type IN ('landfill', 'transfer_station', 'unknown')`
);
const byPlaceId = new Map(facilities.filter((f) => f.place_id).map((f) => [f.place_id!, f]));
console.log(`Ours: ${facilities.length} landfill/transfer/unknown facilities in ${stateSlug}\n`);

// ─── Match ───────────────────────────────────────────────────
function capacityNotes(r: LmopRow): string {
  const parts: string[] = [];
  const open = r['Current Landfill Status'] === 'Open';
  if (r['Year Landfill Opened']) parts.push(`opened ${r['Year Landfill Opened']}`);
  // For open landfills the closure year is a projection, not history
  if (r['Landfill Closure Year']) {
    parts.push(`${open ? 'projected closure' : 'closed'} ${r['Landfill Closure Year']}`);
  }
  if (r['Waste in Place (tons)']) {
    const tons = r['Waste in Place (tons)'];
    const yr = r['Waste in Place Year'] ? ` as of ${r['Waste in Place Year']}` : '';
    parts.push(`${(tons / 1_000_000).toFixed(1)}M tons waste in place${yr}`);
  }
  if (r['Ownership Type']) parts.push(`${r['Ownership Type'].toLowerCase()} ownership`);
  // A closed LMOP unit often shares its site with an active facility (county
  // drop-off at the old landfill) — label it so the note can't read as "this
  // facility is closed"
  const prefix =
    r['Current Landfill Status'] === 'Closed'
      ? 'EPA LMOP (former landfill unit at this site): '
      : 'EPA LMOP: ';
  return `${prefix}${parts.join(', ')}.`;
}

const updates: { id: number; operator: string | null; notes: string; label: string }[] = [];
const reviews: string[] = [];
const unmatchedOpen: string[] = [];
const claimed = new Set<number>();

for (const r of lmop) {
  const label = `${r['Landfill Name']} (${r['Current Landfill Status']}, ${r.County ?? '?'} Co.)`;

  // Hand-verified alias wins over the fuzzy matcher
  const aliased = aliases[String(r['Landfill ID'])] ? byPlaceId.get(aliases[String(r['Landfill ID'])]) : undefined;
  if (aliased && !claimed.has(aliased.id)) {
    claimed.add(aliased.id);
    updates.push({
      id: aliased.id,
      operator: r['Landfill Owner Organization(s)'],
      notes: capacityNotes(r),
      label: `${label} -> ${aliased.name} [alias]`,
    });
    continue;
  }

  const m = bestMatch(
    { name: r['Landfill Name'], lat: r.Latitude, lng: r.Longitude, county: r.County },
    facilities.filter((f) => !claimed.has(f.id))
  );

  if (m?.tier === 'auto') {
    claimed.add(m.target.id);
    updates.push({
      id: m.target.id,
      operator: r['Landfill Owner Organization(s)'],
      notes: capacityNotes(r),
      label: `${label} -> ${m.target.name} [name ${m.nameScore.toFixed(2)}, ${m.distanceMiles?.toFixed(1) ?? '?'}mi]`,
    });
  } else if (m?.tier === 'review') {
    reviews.push(`${label} ~? ${m.target.name} [name ${m.nameScore.toFixed(2)}, ${m.distanceMiles?.toFixed(1) ?? '?'}mi]`);
  } else if (r['Current Landfill Status'] === 'Open') {
    unmatchedOpen.push(label);
  }
}

console.log(`AUTO matches (${updates.length}):`);
for (const u of updates) console.log(`  ${u.label}`);
console.log(`\nREVIEW candidates (${reviews.length}) — not written, decide manually:`);
for (const r of reviews) console.log(`  ${r}`);
console.log(`\nOpen LMOP landfills with no match (${unmatchedOpen.length}) — coverage gaps to consider adding:`);
for (const u of unmatchedOpen) console.log(`  ${u}`);

if (dryRun || updates.length === 0) {
  if (!dryRun) console.log('\nNothing to write.');
  process.exit(0);
}

// ─── Write (operator only if empty — never clobber manual edits) ───
const esc = (v: string) => v.replace(/'/g, "''");
writeFileSync(
  UPDATE_SQL_PATH,
  updates
    .map((u) => {
      const op = u.operator ? `operator = COALESCE(operator, '${esc(u.operator)}'), ` : '';
      return `UPDATE facilities SET ${op}capacity_notes = '${esc(u.notes)}', updated_at = datetime('now') WHERE id = ${u.id};`;
    })
    .join('\n') + '\n'
);
d1ExecFile(root, UPDATE_SQL_PATH);
console.log(`\nWrote ${updates.length} facilities to local D1.`);
