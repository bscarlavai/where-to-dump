/**
 * Attribute SWMD district-site facts to district-run facilities.
 *
 * Deliberately conservative — a district site's fees describe the district's
 * OWN sites, not private facilities in the county. A facility only receives
 * facts when ALL of:
 *   1. it sits in one of the district's counties,
 *   2. it has no fees yet (facility's own website wins over district data),
 *   3. its name looks district-run (county/district/solid waste/recycling
 *      center/convenience/transfer wording),
 *   4. its city or a distinctive name token appears in the district's pages
 *      (the site actually talks about that location).
 *
 * Usage: npx tsx scripts/enrich/extract-swmd.ts [--dry-run]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { d1Query, d1ExecFile } from '../lib/d1';
import { extractFees, extractMaterials, extractResidency, extractOpenToPublic, type FeeFind } from './facts';
import { nameTokens } from './match';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');
const CACHE_DIR = resolve(root, 'enrichment-data', 'swmd-cache');
const UPDATE_SQL_PATH = resolve(root, 'db', 'update-swmd.sql');

const dryRun = process.argv.includes('--dry-run');

const DISTRICT_RUN = /county|district|swmd|solid\s+waste|recycling\s+center|recycle|convenience|transfer\s+station|drop.?off/i;

interface Manifest {
  district: string;
  counties: string[];
  crawled_at: string;
  pages: { url: string; file: string }[];
}

interface FacilityRow {
  id: number;
  name: string;
  city: string | null;
  county: string | null;
  fees: string | null;
  website: string | null;
}

function main() {
  const facilities = d1Query<FacilityRow>(root,
    `SELECT id, name, city, county, fees, website FROM facilities
     WHERE state_slug = 'indiana' AND service_only = 0
       AND status IN ('imported','approved')`
  );

  const updates: string[] = [];
  const esc = (v: string) => v.replace(/'/g, "''");
  let attributed = 0;
  const claimed = new Set<number>();

  for (const dir of readdirSync(CACHE_DIR).filter((d) => /^\d+$/.test(d))) {
    const manifestPath = resolve(CACHE_DIR, dir, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    const manifest: Manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

    // Combined district text + per-page best fees
    let fullText = '';
    let fees: FeeFind[] = [];
    let feesUrl: string | null = null;
    for (const page of manifest.pages) {
      const p = resolve(CACHE_DIR, dir, page.file);
      if (!existsSync(p)) continue;
      const text = readFileSync(p, 'utf-8');
      fullText += '\n' + text;
      const pageFees = extractFees(text);
      if (pageFees.length > fees.length) {
        fees = pageFees;
        feesUrl = page.url;
      }
    }
    const materials = extractMaterials(fullText);
    const residency = extractResidency(fullText);
    const openToPublic = extractOpenToPublic(fullText);
    if (fees.length === 0 && materials.length === 0 && !residency && openToPublic == null) continue;

    const lowerText = fullText.toLowerCase();
    const countySet = new Set(manifest.counties.map((c) => c.toLowerCase()));

    const candidates = facilities.filter((f) => {
      if (claimed.has(f.id)) return false;
      const county = (f.county ?? '').toLowerCase().replace(/\s*county\s*$/, '').replace(/\./g, '');
      if (!countySet.has(county)) return false;
      if (f.fees) return false; // facility's own site already provided fees
      if (!DISTRICT_RUN.test(f.name)) return false;
      // A facility with its own website only counts as district-run when
      // that website IS the district's site (Republic's "Clinton County
      // Landfill" points at republicservices.com — not district-run, even
      // though the county name is in its name)
      if (f.website) {
        try {
          const fHost = new URL(f.website).host.replace(/^www\./, '');
          const dHost = new URL(manifest.pages[0].url).host.replace(/^www\./, '');
          if (fHost !== dHost) return false;
        } catch {
          return false;
        }
      }
      // The district site must actually mention this location
      const cityMentioned = f.city ? lowerText.includes(f.city.toLowerCase()) : false;
      const tokenMentioned = [...nameTokens(f.name)].some((t) => t.length >= 5 && lowerText.includes(t));
      return cityMentioned || tokenMentioned;
    });

    for (const f of candidates) {
      claimed.add(f.id);
      attributed++;
      if (dryRun) {
        console.log(`${manifest.district} -> #${f.id} ${f.name} (${f.city})`);
        for (const fee of fees) console.log(`   fee ${fee.label} = ${fee.amount}   << ${fee.line}`);
        if (materials.length) console.log(`   materials: ${materials.join(', ')}`);
        if (residency) console.log(`   residency: ${residency}`);
        continue;
      }
      const sets: string[] = [];
      if (fees.length) sets.push(`fees = '${esc(JSON.stringify(Object.fromEntries(fees.map((x) => [x.label, x.amount]))))}'`);
      if (materials.length) sets.push(`accepted_materials = '${esc(JSON.stringify(materials))}'`);
      if (residency) sets.push(`residency_restriction = COALESCE(residency_restriction, '${esc(residency)}')`);
      if (openToPublic != null) sets.push(`open_to_public = COALESCE(open_to_public, ${openToPublic})`);
      sets.push(`enrich_source_url = '${esc(feesUrl ?? manifest.pages[0]?.url ?? '')}'`);
      sets.push(`enrich_scraped_at = '${manifest.crawled_at.slice(0, 10)}'`);
      sets.push(`updated_at = datetime('now')`);
      updates.push(`UPDATE facilities SET ${sets.join(', ')} WHERE id = ${f.id};`);
    }
  }

  console.log(`\n${attributed} facilities attributed from district sites`);
  if (dryRun || updates.length === 0) return;
  writeFileSync(UPDATE_SQL_PATH, updates.join('\n') + '\n');
  d1ExecFile(root, UPDATE_SQL_PATH);
  console.log(`Wrote ${updates.length} facilities to local D1.`);
}

main();
