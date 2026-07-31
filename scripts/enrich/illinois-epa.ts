/**
 * Illinois EPA enrichment. Sources (fetched by the discovery pass into
 * enrichment-data/):
 *   - illinois-epa-facilities.geojson  (landfill inventory; only Active rows
 *     are joined — post-closure/unknown-status records would mislabel live
 *     listings)
 *   - illinois-epa-cdd-facilities.geojson (C&DD recovery + CCDD fill sites)
 *   - illinois-epa-compost-facilities.json (real permit numbers, no coords —
 *     matched by fused name + city)
 *
 * Fills permit_number (IEPA Site ID / permit no) + permit_status. Transfer
 * stations: no structured IL source exists (legacy DB is dead) — known gap.
 *
 * Usage: npm run enrich:illinois [-- --dry-run]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { d1Query, d1ExecFile } from '../lib/d1';
import { bestMatch, nameTokens, type MatchTarget } from './match';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');
const UPDATE_SQL_PATH = resolve(root, 'db', 'update-illinois-epa.sql');
const dryRun = process.argv.includes('--dry-run');

interface FacilityRow extends MatchTarget {
  place_id: string | null;
}

function main() {
  const facilities = d1Query<FacilityRow>(root,
    `SELECT id, place_id, name, lat, lng, county, city FROM facilities
     WHERE state_slug = 'illinois' AND service_only = 0`
  );
  console.log(`Ours: ${facilities.length} Illinois facilities\n`);

  const updates: { id: number; permit: string; status: string; label: string }[] = [];
  const gaps: string[] = [];
  const claimed = new Set<number>();

  function tryJoin(
    source: { name: string; lat: number | null; lng: number | null; county?: string | null; city?: string | null },
    permit: string,
    status: string,
    gapWorthy: boolean
  ) {
    const label = `${source.name} (${source.county ?? source.city ?? '?'}, ${permit})`;
    const m = bestMatch(source, facilities.filter((f) => !claimed.has(f.id)));
    if (m?.tier === 'auto') {
      claimed.add(m.target.id);
      updates.push({
        id: m.target.id,
        permit,
        status,
        label: `${label} -> ${m.target.name} [${m.distanceMiles?.toFixed(1) ?? '?'}mi]`,
      });
    } else if (gapWorthy) {
      gaps.push(label);
    }
  }

  // ─── Active landfills ────────────────────────────────────────
  const landfills = JSON.parse(
    readFileSync(resolve(root, 'enrichment-data', 'illinois-epa-facilities.geojson'), 'utf-8')
  ).features as { properties: Record<string, unknown> }[];
  const active = landfills.filter((f) => f.properties.LandfillStatus === 'Active');
  console.log(`IEPA landfills: ${active.length} active (of ${landfills.length} total records)`);
  for (const f of active) {
    const p = f.properties;
    tryJoin(
      { name: String(p.SiteName), lat: Number(p.Latitude) || null, lng: Number(p.Longitude) || null, county: p.County ? String(p.County) : null, city: p.City ? String(p.City) : null },
      `IEPA ${p.SiteID}`,
      'Active (Illinois EPA landfill inventory)',
      true
    );
  }

  // ─── C&DD / CCDD sites ───────────────────────────────────────
  const cddPath = resolve(root, 'enrichment-data', 'illinois-epa-cdd-facilities.geojson');
  if (existsSync(cddPath)) {
    const cdd = JSON.parse(readFileSync(cddPath, 'utf-8')).features as { properties: Record<string, unknown> }[];
    console.log(`IEPA C&DD/CCDD: ${cdd.length} sites`);
    for (const f of cdd) {
      const p = f.properties;
      const name = String(p.Facility_Name ?? p.USER_Facility_Name ?? '');
      if (!name) continue;
      if (p.Status && !/active|open/i.test(String(p.Status))) continue;
      tryJoin(
        { name, lat: Number(p.GisLat) || null, lng: Number(p.GisLong) || null, county: p.County ? String(p.County) : null, city: p.City ? String(p.City) : null },
        `IEPA C&DD`,
        'Registered C&DD/fill operation (Illinois EPA)',
        false
      );
    }
  }

  // ─── Compost permits (no coords: fused name + city equality) ──
  const compostPath = resolve(root, 'enrichment-data', 'illinois-epa-compost-facilities.json');
  if (existsSync(compostPath)) {
    const compost = JSON.parse(readFileSync(compostPath, 'utf-8')) as Record<string, string>[];
    console.log(`IEPA compost permits: ${compost.length}`);
    for (const c of compost) {
      const cityMatch = /\n(.+?),\s*Illinois/i.exec(c.SiteAddress ?? '');
      const city = cityMatch?.[1]?.trim().toLowerCase() ?? null;
      const fused = [...nameTokens(c.SiteName ?? '')].sort().join('');
      if (fused.length < 5) continue;
      const target = facilities.find(
        (f) =>
          !claimed.has(f.id) &&
          (f.city ?? '').toLowerCase() === city &&
          [...nameTokens(f.name)].sort().join('') === fused
      );
      if (target) {
        claimed.add(target.id);
        updates.push({
          id: target.id,
          permit: c.PermitNo,
          status: `Permitted compost facility (Illinois EPA, ${c.PermitType})`,
          label: `${c.SiteName} (compost, ${c.PermitNo}) -> ${target.name} [name+city]`,
        });
      }
    }
  }

  console.log(`\nAUTO matches (${updates.length}):`);
  for (const u of updates) console.log(`  ${u.label}`);
  console.log(`\nActive IEPA landfills with no match (${gaps.length}) — coverage gaps:`);
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

main();
