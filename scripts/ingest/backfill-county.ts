/**
 * Set `county` on a facilities JSON via the FCC Census Area API (free, no key):
 * https://geo.fcc.gov/api/census/area
 *
 * Overwrites ALL records from lat/lng — Outscraper's county field is unreliable
 * (it sometimes contains neighborhood names like "Broad Ripple").
 *
 * Usage: npx tsx scripts/ingest/backfill-county.ts outscraper-data/indiana-merged-facilities.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import type { ClassifiedPlace } from './classify';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npx tsx scripts/ingest/backfill-county.ts <facilities.json>');
  process.exit(1);
}
const path = resolve(file);
const places: ClassifiedPlace[] = JSON.parse(readFileSync(path, 'utf-8'));

async function lookupCounty(lat: number, lon: number): Promise<string | null> {
  const url = `https://geo.fcc.gov/api/census/area?lat=${lat}&lon=${lon}&censusYear=2020&format=json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { results?: Array<{ county_name?: string }> };
      return json.results?.[0]?.county_name ?? null;
    } catch {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return null;
}

async function main() {
  const missing = places.filter((p) => p.latitude != null && p.longitude != null);
  console.log(`${places.length} places, resolving county for ${missing.length} with coordinates`);

  let done = 0;
  let filled = 0;
  const CONCURRENCY = 8;
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const batch = missing.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (p) => {
        const county = await lookupCounty(p.latitude!, p.longitude!);
        if (county) {
          // FCC returns bare names ("Marion"); normalize to "Marion County".
          p.county = /county$/i.test(county) ? county : `${county} County`;
          filled++;
        }
        done++;
      })
    );
    process.stdout.write(`\r  ${done}/${missing.length}`);
  }
  console.log(`\nFilled ${filled}/${missing.length}`);
  writeFileSync(path, JSON.stringify(places, null, 2));
  console.log(`Updated ${path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
