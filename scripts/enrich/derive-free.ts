/**
 * Derive free_for_residents from evidence we already hold: the
 * residency_restriction sentences and the crawled site/district text.
 * Conservative patterns only — "free for residents" style phrasing, not the
 * word "free" alone (which matches "free estimate" on every hauler site).
 *
 * Sets free_for_residents = 1 where evidence exists; never unsets (a manual
 * clear survives re-runs). Never touches status.
 *
 * Usage: npx tsx scripts/enrich/derive-free.ts [--dry-run]
 */

import { readFileSync, existsSync, readdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { d1Query, d1ExecFile } from '../lib/d1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');
const SITE_CACHE = resolve(root, 'enrichment-data', 'site-cache');
const UPDATE_SQL_PATH = resolve(root, 'db', 'update-free-flag.sql');
const dryRun = process.argv.includes('--dry-run');

const FREE_RES =
  /free\s+(?:of\s+charge\s+)?(?:for|to)\s+(?:all\s+)?(?:county\s+|city\s+|town(?:ship)?\s+|village\s+|local\s+)?residents|residents?\s+(?:may\s+|can\s+)?(?:dispose|drop\s*off|recycle|bring)[^.\n]{0,50}\b(?:at\s+no\s+(?:charge|cost)|free)|no\s+(?:charge|cost|fee)\s+(?:for|to)\s+(?:county\s+|city\s+)?residents|residents[^.\n]{0,40}\bat\s+no\s+(?:charge|cost)/i;

function siteText(id: number): string {
  const dir = resolve(SITE_CACHE, String(id));
  if (!existsSync(dir)) return '';
  let text = '';
  try {
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.txt'))) {
      text += readFileSync(resolve(dir, f), 'utf-8') + '\n';
    }
  } catch {
    /* ignore */
  }
  return text;
}

function main() {
  const rows = d1Query<{
    id: number;
    name: string;
    residency_restriction: string | null;
    enrich_source_url: string | null;
    free_for_residents: number | null;
  }>(root,
    `SELECT id, name, residency_restriction, enrich_source_url, free_for_residents
     FROM facilities WHERE service_only = 0 AND status IN ('imported','approved')`
  );

  const hits: { id: number; name: string; evidence: string }[] = [];
  for (const r of rows) {
    if (r.free_for_residents === 1) continue;
    let evidence: string | null = null;
    if (r.residency_restriction && FREE_RES.test(r.residency_restriction)) {
      evidence = `residency field: "${r.residency_restriction.slice(0, 80)}"`;
    } else {
      const m = FREE_RES.exec(siteText(r.id));
      if (m) evidence = `site text: "...${m[0].slice(0, 80)}..."`;
    }
    if (evidence) hits.push({ id: r.id, name: r.name, evidence });
  }

  console.log(`${hits.length} facilities show free-for-residents evidence`);
  for (const h of hits.slice(0, 25)) console.log(`  #${h.id} ${h.name} — ${h.evidence}`);
  if (hits.length > 25) console.log(`  ... and ${hits.length - 25} more`);

  if (dryRun || hits.length === 0) return;
  writeFileSync(
    UPDATE_SQL_PATH,
    hits.map((h) => `UPDATE facilities SET free_for_residents = 1, updated_at = datetime('now') WHERE id = ${h.id};`).join('\n') + '\n'
  );
  d1ExecFile(root, UPDATE_SQL_PATH);
  console.log(`Wrote ${hits.length} flags to local D1.`);
}

main();
