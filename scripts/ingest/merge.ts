/**
 * Merge the state-level and county fan-out ingest outputs into
 * {state}-merged-facilities.json, deduped by place_id with source_queries
 * combined. Downstream: backfill-county -> import-facilities.
 *
 * Usage: npx tsx scripts/ingest/merge.ts --state ohio
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ClassifiedPlace } from './classify';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');

const idx = process.argv.indexOf('--state');
const stateSlug = idx !== -1 ? process.argv[idx + 1]?.toLowerCase().replace(/[_ ]/g, '-') : undefined;
if (!stateSlug) {
  console.error('Usage: npx tsx scripts/ingest/merge.ts --state ohio');
  process.exit(1);
}

const merged = new Map<string, ClassifiedPlace>();
let read = 0;
for (const suffix of ['facilities', 'county-facilities']) {
  const path = resolve(root, 'outscraper-data', `${stateSlug}-${suffix}.json`);
  if (!existsSync(path)) {
    console.log(`(skip: ${stateSlug}-${suffix}.json not found)`);
    continue;
  }
  const places: ClassifiedPlace[] = JSON.parse(readFileSync(path, 'utf-8'));
  read += places.length;
  for (const p of places) {
    if (!p.place_id) continue;
    const existing = merged.get(p.place_id);
    if (existing) {
      existing.source_queries = [...new Set([...existing.source_queries, ...p.source_queries])];
    } else {
      merged.set(p.place_id, p);
    }
  }
}

const out = resolve(root, 'outscraper-data', `${stateSlug}-merged-facilities.json`);
writeFileSync(out, JSON.stringify([...merged.values()], null, 2));
console.log(`${read} records read -> ${merged.size} unique facilities -> ${out}`);
