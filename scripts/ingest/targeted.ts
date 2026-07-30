/**
 * Targeted Outscraper ingest: fetch specific facilities by name (e.g. LMOP
 * coverage gaps) instead of category fan-out. PAID — ask before running.
 *
 * Reads one query per line from a text file, fetches up to --limit results
 * per query, classifies, drops out-of-state noise, and writes
 * outscraper-data/{state}-targeted-facilities.json for the normal downstream
 * pipeline (backfill-county -> import-facilities -> photos -> score).
 *
 * Usage:
 *   npx tsx scripts/ingest/targeted.ts --state indiana --queries enrichment-data/indiana-gaps.txt [--limit 3] [--dry-run]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { searchMaps } from './outscraper';
import { classify, type ClassifiedPlace } from './classify';
import { loadEnvLocal } from '../lib/env';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');
loadEnvLocal(root);

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const stateSlug = argValue('--state')?.toLowerCase().replace(/[_ ]/g, '-');
const queriesFile = argValue('--queries');
const limit = Number(argValue('--limit') ?? 3);
const dryRun = process.argv.includes('--dry-run');

if (!stateSlug || !queriesFile) {
  console.error('Usage: npx tsx scripts/ingest/targeted.ts --state indiana --queries <file> [--limit 3] [--dry-run]');
  process.exit(1);
}
const stateName = stateSlug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

const queries = readFileSync(resolve(queriesFile), 'utf-8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

console.log(`${queries.length} targeted queries, limit ${limit}/query (~${queries.length * limit} records max)`);
for (const q of queries) console.log(`  ${q}`);
if (dryRun) process.exit(0);

async function main() {
  const places = (await searchMaps(queries, { limitPerQuery: limit })).flat();

  const seen = new Set<string>();
  const classified: ClassifiedPlace[] = [];
  let dropped = 0;
  for (const place of places) {
    if (!place.place_id || seen.has(place.place_id)) continue;
    seen.add(place.place_id);
    if (place.state !== stateName) {
      dropped++;
      continue;
    }
    const c = classify(place, [(place.query as string | undefined) ?? 'targeted']);
    // Targeted queries are hand-curated known-real facilities — the hauler
    // heuristics misfire on names like "X Landfill & Hauling". Trust the list,
    // but log the override so junk results can be pruned from the JSON.
    if (c.service_only) {
      console.log(`  (service_only override -> 0: ${c.name})`);
      c.service_only = false;
    }
    classified.push(c);
  }

  mkdirSync(resolve(root, 'outscraper-data'), { recursive: true });
  const outPath = resolve(root, 'outscraper-data', `${stateSlug}-targeted-facilities.json`);
  writeFileSync(outPath, JSON.stringify(classified, null, 2));

  console.log(`\n${classified.length} unique in-state places (${dropped} out-of-state dropped)`);
  for (const p of classified) {
    console.log(`  [${p.facility_type}${p.service_only ? ', SERVICE' : ''}] ${p.name} (${p.city ?? '?'}) — ${p.source_queries[0]}`);
  }
  console.log(`\nWrote ${outPath}`);
  console.log(`Next: npx tsx scripts/ingest/backfill-county.ts ${outPath.replace(root + '/', '')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
