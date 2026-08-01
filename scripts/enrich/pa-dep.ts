/**
 * Pennsylvania DEP enrichment. Sources (fetched by the discovery pass):
 *   - enrichment-data/pa-dep-facilities.geojson — eFACTS-derived layers
 *     (landfills, transfer stations, resource recovery, composting...).
 *     ACTIVE sites only; abandoned-landfill and generator layers skipped.
 *     No address/county fields exist in the source — matching leans on
 *     coordinates, which the layer does have.
 *   - enrichment-data/pa-dep-tonnage.xlsx — per-facility quarterly tonnage
 *     (Power BI export, capped at 150k rows). Latest complete year's total
 *     is appended to capacity_notes for matched disposal facilities.
 *
 * Usage: npm run enrich:pa [-- --dry-run]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { d1Query, d1ExecFile } from '../lib/d1';
import { bestMatch, type MatchTarget } from './match';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');
const UPDATE_SQL_PATH = resolve(root, 'db', 'update-pa-dep.sql');
const dryRun = process.argv.includes('--dry-run');

const SKIP_CATEGORIES = /abandoned|generator|impoundment|land_application/i;
const GAP_CATEGORIES = /municipal_landfill|municipal_transfer_station/i;

interface PaProps {
  SITE_NAME: string | null;
  PRIMARY_FACILITY_NAME: string | null;
  CLIENT_NAME: string | null;
  OTHER_FACILITY_ID: string | null;
  SUB_FACILITY_TYPE: string | null;
  SITE_STATUS: string | null;
  waste_category: string | null;
}

function main() {
  const geo = JSON.parse(
    readFileSync(resolve(root, 'enrichment-data', 'pa-dep-facilities.geojson'), 'utf-8')
  ) as { features: { properties: PaProps; geometry: { coordinates: [number, number] } | null }[] };

  // eFACTS emits one row per SUB-facility — dedupe to one row per site so a
  // landfill's dozen sub-permits don't fight over (and inflate gaps after)
  // the same match
  const bySite = new Map<string, (typeof geo.features)[number]>();
  for (const f of geo.features) {
    if (!/active/i.test(f.properties.SITE_STATUS ?? '')) continue;
    if (SKIP_CATEGORIES.test(f.properties.waste_category ?? '')) continue;
    const key = `${f.properties.SITE_NAME ?? f.properties.PRIMARY_FACILITY_NAME}|${f.properties.waste_category}`;
    if (!bySite.has(key)) bySite.set(key, f);
  }
  const rows = [...bySite.values()];
  console.log(`PA DEP: ${rows.length} active sites after dedupe (of ${geo.features.length} records)`);

  // Latest complete year's tonnage per permit
  const tonnageByPermit = new Map<string, { year: number; tons: number }>();
  const tonnagePath = resolve(root, 'enrichment-data', 'pa-dep-tonnage.xlsx');
  if (existsSync(tonnagePath)) {
    const wb = XLSX.read(readFileSync(tonnagePath));
    // Power BI exports prepend a filter-note row; real headers are on row 3
    const t = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]], { range: 2 });
    // reduce, not Math.max(...spread) — 150k args overflows the call stack
    const maxYear = t.reduce((m, r) => Math.max(m, Number(r.year) || 0), 0) - 1; // last complete year
    for (const r of t) {
      if (Number(r.year) !== maxYear) continue;
      const cur = tonnageByPermit.get(r.Permit) ?? { year: maxYear, tons: 0 };
      cur.tons += Number(r.Total) || 0;
      tonnageByPermit.set(r.Permit, cur);
    }
    console.log(`Tonnage: ${tonnageByPermit.size} facilities with ${maxYear} totals`);
  }

  interface FacilityRow extends MatchTarget {
    capacity_notes: string | null;
  }
  const facilities = d1Query<FacilityRow>(root,
    `SELECT id, name, lat, lng, county, city, capacity_notes FROM facilities
     WHERE state_slug = 'pennsylvania' AND service_only = 0`
  );
  console.log(`Ours: ${facilities.length} PA facilities\n`);

  const updates: { id: number; sets: string[]; label: string }[] = [];
  const gaps: string[] = [];
  const claimed = new Set<number>();
  const esc = (v: string) => v.replace(/'/g, "''");

  for (const f of rows) {
    const p = f.properties;
    const name = p.SITE_NAME ?? p.PRIMARY_FACILITY_NAME;
    if (!name || !f.geometry) continue;
    const [lng, lat] = f.geometry.coordinates;
    const permit = p.OTHER_FACILITY_ID ? `PA DEP ${p.OTHER_FACILITY_ID}` : null;
    const label = `${name} [${p.SUB_FACILITY_TYPE}] (${p.OTHER_FACILITY_ID ?? '?'})`;

    const m = bestMatch(
      { name, lat, lng, county: null, city: null },
      facilities.filter((x) => !claimed.has(x.id))
    );

    if (m?.tier === 'auto') {
      claimed.add(m.target.id);
      const sets: string[] = [];
      if (permit) sets.push(`permit_number = '${esc(permit)}'`);
      sets.push(`permit_status = 'Active (PA DEP, ${esc(p.SUB_FACILITY_TYPE ?? p.waste_category ?? 'permitted')})'`);
      if (p.CLIENT_NAME) sets.push(`operator = COALESCE(operator, '${esc(p.CLIENT_NAME)}')`);
      const tons = p.OTHER_FACILITY_ID ? tonnageByPermit.get(p.OTHER_FACILITY_ID) : undefined;
      if (tons && tons.tons > 0) {
        const note = `PA DEP: received ${Math.round(tons.tons).toLocaleString('en-US')} tons of waste in ${tons.year}.`;
        const existing = m.target.capacity_notes ? `${m.target.capacity_notes} ` : '';
        sets.push(`capacity_notes = '${esc(existing + note)}'`);
      }
      updates.push({ id: m.target.id, sets, label: `${label} -> ${m.target.name} [${m.distanceMiles?.toFixed(1) ?? '?'}mi]${tons ? ' +tonnage' : ''}` });
    } else if (GAP_CATEGORIES.test(p.waste_category ?? '')) {
      gaps.push(label);
    }
  }

  console.log(`AUTO matches (${updates.length}):`);
  for (const u of updates) console.log(`  ${u.label}`);
  console.log(`\nActive landfills/transfer stations with no match (${gaps.length}) — coverage gaps:`);
  for (const g of gaps.slice(0, 40)) console.log(`  ${g}`);
  if (gaps.length > 40) console.log(`  ... and ${gaps.length - 40} more`);

  if (dryRun || updates.length === 0) return;
  writeFileSync(
    UPDATE_SQL_PATH,
    updates
      .map((u) => `UPDATE facilities SET ${u.sets.join(', ')}, updated_at = datetime('now') WHERE id = ${u.id};`)
      .join('\n') + '\n'
  );
  d1ExecFile(root, UPDATE_SQL_PATH);
  console.log(`\nWrote ${updates.length} facilities to local D1.`);
}

main();
