/**
 * New York DEC enrichment: join data.ny.gov's Solid Waste Management
 * Facilities dataset (active only, Socrata id 2fni-raj8, fetched to
 * enrichment-data/ny-dec-facilities.csv) to our NY facilities.
 *
 * Fills permit_number (authorization_number) + permit_status + operator.
 * lat/lng parsed from the georeference blob (90% of rows); rows without it
 * are skipped (state-plane conversion not worth 261 rows).
 *
 * Usage: npm run enrich:ny [-- --dry-run]
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { d1Query, d1ExecFile } from '../lib/d1';
import { bestMatch, type MatchTarget } from './match';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');
const CSV_PATH = resolve(root, 'enrichment-data', 'ny-dec-facilities.csv');
const UPDATE_SQL_PATH = resolve(root, 'db', 'update-ny-dec.sql');
const dryRun = process.argv.includes('--dry-run');

// Minimal RFC4180 parser — the georeference field embeds newlines
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      cur.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      cur.push(field);
      field = '';
      if (cur.length > 1 || cur[0] !== '') rows.push(cur);
      cur = [];
    } else {
      field += c;
    }
  }
  if (field || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  const header = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const GAP_ACTIVITIES = /landfill|transfer (facility|station).*permit/i;
const ACTIVITY_PRIORITY = [/landfill/i, /transfer/i, /scrap metal/i, /composting/i];

function main() {
  const records = parseCsv(readFileSync(CSV_PATH, 'utf-8'));
  const rows = records
    .map((r) => {
      const geo = /\(([\d.-]+),\s*([\d.-]+)\)/.exec(r.georeference ?? '');
      return {
        name: r.facility_name,
        activity: r.activity_desc,
        permit: r.authorization_number || r.activity_number?.replace(/[[\]]/g, ''),
        owner: r.owner_name,
        county: r.county,
        city: r.city,
        lat: geo ? Number(geo[1]) : null,
        lng: geo ? Number(geo[2]) : null,
      };
    })
    .filter((r) => r.name && r.lat != null);
  rows.sort((a, b) => {
    const pa = ACTIVITY_PRIORITY.findIndex((re) => re.test(a.activity));
    const pb = ACTIVITY_PRIORITY.findIndex((re) => re.test(b.activity));
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
  });
  console.log(`NYSDEC: ${rows.length} active facilities with coordinates (of ${records.length})`);

  interface FacilityRow extends MatchTarget {
    place_id: string | null;
  }
  const facilities = d1Query<FacilityRow>(root,
    `SELECT id, place_id, name, lat, lng, county, city FROM facilities
     WHERE state_slug = 'new-york' AND service_only = 0`
  );
  console.log(`Ours: ${facilities.length} NY facilities\n`);

  const updates: { id: number; sets: string[]; label: string }[] = [];
  const gaps: string[] = [];
  const claimed = new Set<number>();
  const esc = (v: string) => v.replace(/'/g, "''");

  for (const r of rows) {
    const label = `${r.name} [${r.activity}] (${r.county}, ${r.permit || '?'})`;
    const m = bestMatch(
      { name: r.name, lat: r.lat, lng: r.lng, county: r.county, city: r.city },
      facilities.filter((x) => !claimed.has(x.id))
    );
    if (m?.tier === 'auto') {
      claimed.add(m.target.id);
      const sets: string[] = [];
      if (r.permit) sets.push(`permit_number = 'NYSDEC ${esc(r.permit)}'`);
      sets.push(`permit_status = 'Active (NYSDEC, ${esc(r.activity)})'`);
      if (r.owner) sets.push(`operator = COALESCE(operator, '${esc(r.owner)}')`);
      updates.push({ id: m.target.id, sets, label: `${label} -> ${m.target.name} [${m.distanceMiles?.toFixed(1) ?? '?'}mi]` });
    } else if (GAP_ACTIVITIES.test(r.activity)) {
      gaps.push(label);
    }
  }

  console.log(`AUTO matches (${updates.length}):`);
  for (const u of updates.slice(0, 30)) console.log(`  ${u.label}`);
  if (updates.length > 30) console.log(`  ... and ${updates.length - 30} more`);
  console.log(`\nPermitted landfills/transfer facilities with no match (${gaps.length}) — coverage gaps (first 30):`);
  for (const g of gaps.slice(0, 30)) console.log(`  ${g}`);

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
