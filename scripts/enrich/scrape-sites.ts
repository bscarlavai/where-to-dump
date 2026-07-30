/**
 * Facility website crawler (phase-3 moat data, step 1 of 2).
 *
 * For every visible facility with a website, fetch the homepage plus up to 3
 * fee/materials-relevant subpages and cache their visible text in
 * enrichment-data/site-cache/<facility-id>/. Extraction happens separately
 * (extract-facts.ts) so rules can be re-tuned without re-crawling.
 *
 * Crawl helpers shared with the SWMD crawler live in crawl.ts. Polite:
 * 1 concurrent request per host, global concurrency 6, bot UA.
 *
 * Usage:
 *   npx tsx scripts/enrich/scrape-sites.ts --state indiana [--limit 20] [--force]
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { d1Query } from '../lib/d1';
import { crawlSite, closeBrowser } from './crawl';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');
const CACHE_DIR = resolve(root, 'enrichment-data', 'site-cache');

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const stateSlug = argValue('--state') ?? 'indiana';
const limit = argValue('--limit') ? Number(argValue('--limit')) : null;
const force = process.argv.includes('--force');

interface Row {
  id: number;
  name: string;
  website: string;
}

async function crawlFacility(f: Row): Promise<string> {
  const dir = resolve(CACHE_DIR, String(f.id));
  const manifestPath = resolve(dir, 'manifest.json');
  if (!force && existsSync(manifestPath)) return 'cached';

  const pages = await crawlSite(f.website, dir, 3);
  if (!pages) return 'unreachable';

  writeFileSync(
    manifestPath,
    JSON.stringify(
      { facility_id: f.id, name: f.name, website: f.website, crawled_at: new Date().toISOString(), pages },
      null,
      2
    )
  );
  return `ok (${pages.length} pages)`;
}

async function main() {
  const rows = d1Query<Row>(root,
    `SELECT id, name, website FROM facilities
     WHERE state_slug = '${stateSlug}' AND service_only = 0 AND website IS NOT NULL
       AND status IN ('imported','approved')
     ORDER BY id`
  );
  const work = limit ? rows.slice(0, limit) : rows;
  console.log(`${rows.length} facilities with websites${limit ? `, crawling ${work.length}` : ''}`);
  mkdirSync(CACHE_DIR, { recursive: true });

  const CONCURRENCY = 6;
  let idx = 0;
  const counts: Record<string, number> = {};
  const busyHosts = new Set<string>();

  async function worker() {
    while (idx < work.length) {
      const f = work[idx];
      let host = '';
      try {
        host = new URL(f.website).host;
      } catch {
        idx++;
        counts['bad-url'] = (counts['bad-url'] ?? 0) + 1;
        continue;
      }
      if (busyHosts.has(host)) {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      idx++;
      busyHosts.add(host);
      try {
        const result = await crawlFacility(f);
        const key = result.split(' ')[0];
        counts[key] = (counts[key] ?? 0) + 1;
        if ((idx & 15) === 0) console.log(`  ${idx}/${work.length}...`);
      } finally {
        busyHosts.delete(host);
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await closeBrowser();
  console.log('\nDone:', JSON.stringify(counts));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
