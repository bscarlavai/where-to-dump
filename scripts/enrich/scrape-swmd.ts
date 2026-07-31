/**
 * SWMD district-site crawler. Indiana's Solid Waste Management Districts
 * publish fees and accepted-items lists for the facilities they run — often
 * facilities that have no website of their own.
 *
 * Reads enrichment-data/indiana-swmd.json (district -> counties + website),
 * crawls each district site (homepage + up to 5 relevant subpages) into
 * enrichment-data/swmd-cache/<index>/. Attribution to facilities happens in
 * extract-swmd.ts.
 *
 * Usage: npx tsx scripts/enrich/scrape-swmd.ts [--limit 5] [--force]
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { crawlSite, closeBrowser } from './crawl';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');
const stateIdx = process.argv.indexOf('--state');
const STATE = stateIdx !== -1 ? process.argv[stateIdx + 1] : 'indiana';
const LIST_PATH = resolve(root, 'enrichment-data', STATE + '-swmd.json');
const CACHE_DIR = resolve(root, 'enrichment-data', 'swmd-cache', STATE);

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const limit = argValue('--limit') ? Number(argValue('--limit')) : null;
const force = process.argv.includes('--force');

interface District {
  district: string;
  counties: string[];
  website: string;
  facebook: boolean;
}

async function main() {
  const districts: District[] = JSON.parse(readFileSync(LIST_PATH, 'utf-8')).filter(
    (d: District) => d.website && !d.facebook
  );
  const work = limit ? districts.slice(0, limit) : districts;
  console.log(`${districts.length} crawlable districts${limit ? `, crawling ${work.length}` : ''}`);
  mkdirSync(CACHE_DIR, { recursive: true });

  const counts: Record<string, number> = {};
  // Districts are all distinct hosts — modest parallelism, still polite
  const CONCURRENCY = 5;
  let idx = 0;

  async function worker() {
    while (idx < work.length) {
      const i = idx++;
      const d = work[i];
      const dir = resolve(CACHE_DIR, String(districts.indexOf(d)));
      const manifestPath = resolve(dir, 'manifest.json');
      if (!force && existsSync(manifestPath)) {
        counts['cached'] = (counts['cached'] ?? 0) + 1;
        continue;
      }
      const pages = await crawlSite(d.website, dir, 5);
      if (!pages) {
        counts['unreachable'] = (counts['unreachable'] ?? 0) + 1;
        console.log(`  unreachable: ${d.district} (${d.website})`);
        continue;
      }
      writeFileSync(
        manifestPath,
        JSON.stringify(
          { district: d.district, counties: d.counties, website: d.website, crawled_at: new Date().toISOString(), pages },
          null,
          2
        )
      );
      counts['ok'] = (counts['ok'] ?? 0) + 1;
      if ((i & 7) === 0) console.log(`  ${i}/${work.length}...`);
      await new Promise((r) => setTimeout(r, 250));
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
