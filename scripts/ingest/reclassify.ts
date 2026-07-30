/**
 * Re-run classification over an existing facilities JSON in place (after
 * classifier rule changes), preserving source_queries.
 *
 * Usage: npx tsx scripts/ingest/reclassify.ts outscraper-data/indiana-merged-facilities.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { classify, type ClassifiedPlace } from './classify';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npx tsx scripts/ingest/reclassify.ts <facilities.json>');
  process.exit(1);
}
const path = resolve(file);
const places: ClassifiedPlace[] = JSON.parse(readFileSync(path, 'utf-8'));

let typeChanges = 0;
let flagChanges = 0;
const updated = places.map((p) => {
  const next = classify(p, p.source_queries);
  if (next.facility_type !== p.facility_type) typeChanges++;
  if (next.service_only !== p.service_only) flagChanges++;
  return next;
});

writeFileSync(path, JSON.stringify(updated, null, 2));
console.log(`${places.length} places: ${typeChanges} type changes, ${flagChanges} service_only changes`);
