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

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');
const CACHE_DIR = resolve(root, 'enrichment-data', 'site-cache');
const UPDATE_SQL_PATH = resolve(root, 'db', 'update-facts.sql');

const dryRun = process.argv.includes('--dry-run');
const onlyIdArg = process.argv.indexOf('--id');
const onlyId = onlyIdArg !== -1 ? Number(process.argv[onlyIdArg + 1]) : null;

// ─── Fee extraction ──────────────────────────────────────────
const MONEY = /\$\s?(\d{1,4}(?:\.\d{2})?)/;
// unit keyword -> fee table label
const FEE_UNITS: Array<[RegExp, string]> = [
  [/per\s+ton|a\s+ton|\/\s*ton/i, 'per_ton'],
  [/per\s+(?:cubic\s+)?yard|\/\s*(?:cu\.?\s*)?yd/i, 'per_cubic_yard'],
  [/minimum|min\.?\s*(?:charge|fee)/i, 'minimum'],
  [/per\s+(?:car|pickup|truck)\s*(?:load)?|car\s*load|pick-?up\s+load/i, 'car_or_pickup_load'],
  [/per\s+load/i, 'per_load'],
  [/per\s+bag|a\s+bag/i, 'per_bag'],
  [/(?:per\s+)?(?:passenger\s+)?tire/i, 'tires'],
  [/mattress|box\s*spring/i, 'mattress'],
  [/appliance|refrigerator|freon|white\s+goods/i, 'appliances'],
  [/television|tv\b|monitor|electronic/i, 'electronics'],
];

interface FeeFind {
  label: string;
  amount: string;
  line: string;
}

// Products being SOLD (mulch, compost, soil) also price by the yard/ton —
// those are revenue lines, not disposal fees
const SALE_CONTEXT = /mulch|hardwood|topsoil|top\s+soil|soil\b|stone\b|gravel|sand\b|firewood|finished\s+compost|delivery|originally|sale\b|coupon|discount\s+code|buy\b|purchase/i;

function extractFees(text: string): FeeFind[] {
  const found = new Map<string, FeeFind>();
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length > 300) continue; // running text, not a rate line
    if (SALE_CONTEXT.test(line)) continue;
    const money = MONEY.exec(line);
    if (!money) continue;
    const amount = Number(money[1]);
    if (amount <= 0 || amount > 500) continue; // fee-shaped only
    const ranged = /\$\s?\d[\d.]*\s*(?:to|-|–)\s*\$?\d/.test(line);

    // "X per ton with a minimum of $Y" — the minimum is the LAST dollar
    // figure, and the rest of the line belongs to it, not to other units
    if (/minimum|min\.?\s*(?:charge|fee)/i.test(line)) {
      const all = [...line.matchAll(new RegExp(MONEY.source, 'g'))];
      const last = all[all.length - 1][1];
      if (!found.has('minimum') && Number(last) > 0 && Number(last) <= 500) {
        found.set('minimum', { label: 'minimum', amount: `$${last}`, line: line.slice(0, 160) });
      }
      continue;
    }

    for (const [re, label] of FEE_UNITS) {
      const kw = re.exec(line);
      if (!kw || found.has(label)) continue;
      // Item-priced labels: the $ must be near the keyword, or "$20 truck
      // load ... not including tires" reads as a tire fee
      const ITEM_LABELS = new Set(['tires', 'mattress', 'appliances', 'electronics']);
      if (ITEM_LABELS.has(label) && Math.abs(kw.index - (money.index ?? 0)) > 60) continue;
      found.set(label, {
        label,
        amount: ranged ? `from $${money[1]}` : `$${money[1]}`,
        line: line.slice(0, 160),
      });
    }
  }
  return [...found.values()];
}

// ─── Materials extraction ────────────────────────────────────
// taxonomy key (MATERIAL_LABELS in src/lib/constants) -> detection regex
const MATERIALS: Array<[string, RegExp]> = [
  ['household', /household\s+(?:trash|waste|garbage)|municipal\s+solid\s+waste|residential\s+(?:trash|waste|garbage)/i],
  ['construction', /construction\s+(?:debris|waste|material)|c\s*&\s*d\b|demolition\s+debris|drywall|shingles/i],
  ['yard', /yard\s+(?:waste|trimmings|debris)|brush|leaves|grass\s+clippings|limbs|compost/i],
  ['e_waste', /e-?waste|electronics?\s+(?:recycling|disposal|drop)|computers?\b|televisions?\b/i],
  ['hazmat', /household\s+hazardous|hazardous\s+waste|paint\b|chemicals\b|pesticide|tox-?away/i],
  ['tires', /\btires?\b/i],
  ['appliances', /appliances?\b|white\s+goods|refrigerators?\b|washers?\b|dryers?\b/i],
  ['scrap_metal', /scrap\s+metal|metal\s+recycling/i],
];
// Only count a material if the page also talks about accepting/taking things
const ACCEPT_CONTEXT = /accept|we\s+take|drop.?off|recycl|dispos|bring|collection\s+site|items?\s+(?:allowed|taken)/i;

function extractMaterials(text: string): string[] {
  if (!ACCEPT_CONTEXT.test(text)) return [];
  const found: string[] = [];
  for (const [key, re] of MATERIALS) {
    if (re.test(text)) found.push(key);
  }
  // A page matching almost everything is likely a services brochure, not an
  // accepted-materials list — require some selectivity
  return found.length >= MATERIALS.length ? [] : found;
}

// ─── Residency / public access ───────────────────────────────
const RESIDENCY = /[^.\n]{0,80}\b(?:residents?\s+only|proof\s+of\s+residen|must\s+(?:be|show|provide)[^.\n]{0,40}residen|open\s+(?:only\s+)?to\s+[a-z]+\s+county\s+residents)[^.\n]{0,80}/i;

function extractResidency(text: string): string | null {
  const m = RESIDENCY.exec(text);
  if (!m) return null;
  const sentence = m[0].trim().replace(/\s+/g, ' ');
  return sentence.length >= 15 ? sentence.slice(0, 200) : null;
}

function extractOpenToPublic(text: string): number | null {
  if (/not\s+open\s+to\s+the\s+public|closed\s+to\s+the\s+public/i.test(text)) return 0;
  if (/open\s+to\s+the\s+public/i.test(text)) return 1;
  return null;
}

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
