/**
 * Fees / accepted-materials extraction (phase-3 moat data, step 2 of 2).
 *
 * Reads the site-cache built by scrape-sites.ts and pulls conservative,
 * high-confidence facts:
 *   - fees: dollar amounts adjacent to a unit ("per ton", "per load", "per
 *     tire"...) or a known item word — written as {label: "$x"} for the
 *     detail page's fee table
 *   - accepted_materials: taxonomy keywords appearing in an accept/take/
 *     recycle context — written as the MATERIAL_LABELS keys
 *   - residency_restriction: sentence matching residents-only phrasing
 *   - open_to_public: explicit "open to the public" / "not open to the public"
 *
 * Writes only when something was found; never touches status; stores the
 * source page URL + crawl date for provenance. Re-runnable after rule tweaks
 * without re-crawling.
 *
 * Usage:
 *   npx tsx scripts/enrich/extract-facts.ts [--dry-run] [--id 123]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { d1Query, d1ExecFile } from '../lib/d1';
import { extractFees, extractMaterials, extractResidency, extractOpenToPublic, type FeeFind } from './facts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');
const CACHE_DIR = resolve(root, 'enrichment-data', 'site-cache');
const UPDATE_SQL_PATH = resolve(root, 'db', 'update-facts.sql');

const dryRun = process.argv.includes('--dry-run');
const onlyIdArg = process.argv.indexOf('--id');
const onlyId = onlyIdArg !== -1 ? Number(process.argv[onlyIdArg + 1]) : null;

// ─── Main ────────────────────────────────────────────────────
interface Manifest {
  facility_id: number;
  name: string;
  crawled_at: string;
  pages: { url: string; file: string }[];
}

function main() {
  const dirs = readdirSync(CACHE_DIR).filter((d) => /^\d+$/.test(d));
  const facilityNames = new Map(
    d1Query<{ id: number; name: string }>(root, `SELECT id, name FROM facilities`).map((r) => [r.id, r.name])
  );

  let withFees = 0;
  let withMaterials = 0;
  let withResidency = 0;
  const updates: string[] = [];
  const esc = (v: string) => v.replace(/'/g, "''");

  for (const dir of dirs) {
    const id = Number(dir);
    if (onlyId && id !== onlyId) continue;
    if (!facilityNames.has(id)) continue;
    const manifestPath = resolve(CACHE_DIR, dir, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    const manifest: Manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

    // Best facts across pages; remember which page produced the fees
    let fees: FeeFind[] = [];
    let feesUrl: string | null = null;
    const materials = new Set<string>();
    let residency: string | null = null;
    let openToPublic: number | null = null;

    for (const page of manifest.pages) {
      const path = resolve(CACHE_DIR, dir, page.file);
      if (!existsSync(path)) continue;
      const text = readFileSync(path, 'utf-8');
      const pageFees = extractFees(text);
      if (pageFees.length > fees.length) {
        fees = pageFees;
        feesUrl = page.url;
      }
      for (const m of extractMaterials(text)) materials.add(m);
      residency ??= extractResidency(text);
      openToPublic ??= extractOpenToPublic(text);
    }

    if (fees.length === 0 && materials.size === 0 && !residency && openToPublic == null) continue;

    if (fees.length) withFees++;
    if (materials.size) withMaterials++;
    if (residency) withResidency++;

    if (dryRun) {
      console.log(`#${id} ${facilityNames.get(id)}`);
      for (const f of fees) console.log(`   fee ${f.label} = ${f.amount}   << ${f.line}`);
      if (materials.size) console.log(`   materials: ${[...materials].join(', ')}`);
      if (residency) console.log(`   residency: ${residency}`);
      if (openToPublic != null) console.log(`   open_to_public: ${openToPublic}`);
      continue;
    }

    const sets: string[] = [];
    if (fees.length) {
      const feesObj = Object.fromEntries(fees.map((f) => [f.label, f.amount]));
      sets.push(`fees = '${esc(JSON.stringify(feesObj))}'`);
    }
    if (materials.size) sets.push(`accepted_materials = '${esc(JSON.stringify([...materials]))}'`);
    if (residency) sets.push(`residency_restriction = '${esc(residency)}'`);
    if (openToPublic != null) sets.push(`open_to_public = ${openToPublic}`);
    const sourceUrl = feesUrl ?? manifest.pages[0]?.url ?? '';
    sets.push(`enrich_source_url = '${esc(sourceUrl)}'`);
    sets.push(`enrich_scraped_at = '${manifest.crawled_at.slice(0, 10)}'`);
    sets.push(`updated_at = datetime('now')`);
    updates.push(`UPDATE facilities SET ${sets.join(', ')} WHERE id = ${id};`);
  }

  console.log(`\n${dirs.length} crawled facilities: ${withFees} with fees, ${withMaterials} with materials, ${withResidency} with residency info`);

  if (dryRun || updates.length === 0) return;
  writeFileSync(UPDATE_SQL_PATH, updates.join('\n') + '\n');
  d1ExecFile(root, UPDATE_SQL_PATH);
  console.log(`Wrote ${updates.length} facilities to local D1.`);
}

main();
