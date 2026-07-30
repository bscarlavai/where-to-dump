/**
 * Facility website crawler (phase-3 moat data, step 1 of 2).
 *
 * For every visible facility with a website, fetch the homepage plus up to 3
 * fee/materials-relevant subpages and cache their visible text in
 * enrichment-data/site-cache/<facility-id>/. Extraction happens separately
 * (extract-facts.ts) so rules can be re-tuned without re-crawling.
 *
 * Plain fetch first; Playwright (chromium) only when a page looks like a JS
 * shell. Polite: 1 concurrent request per host, global concurrency 6,
 * 15s timeout, identifies itself in the UA.
 *
 * Usage:
 *   npx tsx scripts/enrich/scrape-sites.ts --state indiana [--limit 20] [--force]
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { d1Query } from '../lib/d1';

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

const UA = 'Mozilla/5.0 (compatible; WhereToDumpBot/1.0; +https://wheretodump.com)';
const PAGE_TIMEOUT_MS = 15_000;
const MAX_SUBPAGES = 3;
const SUBPAGE_HINT = /fee|rate|pric|tip|dispos|accept|material|recycl|drop.?off|residen|faq|service|waste|landfill|transfer/i;
const SUBPAGE_AVOID = /login|account|career|news|blog|event|contact|privacy|terms|facebook|twitter|instagram|youtube|linkedin|\.(pdf|jpg|png|zip|doc)/i;

// ─── HTML → visible text (no deps) ───────────────────────────
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/td)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#?\w+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function extractLinks(html: string, base: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  const re = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const href = new URL(m[1], base).toString();
      out.push({ href, text: htmlToText(m[2]).slice(0, 120) });
    } catch {
      /* bad href */
    }
  }
  return out;
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html')) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Playwright fallback for JS shells — loaded lazily so plain-fetch runs don't need chromium
let browserPromise: Promise<import('playwright').Browser> | null = null;
async function renderPage(url: string): Promise<string | null> {
  try {
    if (!browserPromise) {
      browserPromise = import('playwright').then((pw) => pw.chromium.launch());
    }
    const browser = await browserPromise;
    const page = await browser.newPage({ userAgent: UA });
    try {
      await page.goto(url, { timeout: PAGE_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      return await page.content();
    } finally {
      await page.close();
    }
  } catch {
    return null;
  }
}

async function getPage(url: string): Promise<{ html: string; rendered: boolean } | null> {
  const html = await fetchPage(url);
  if (html && htmlToText(html).length >= 400) return { html, rendered: false };
  const rendered = await renderPage(url);
  if (rendered && htmlToText(rendered).length >= 200) return { html: rendered, rendered: true };
  return html ? { html, rendered: false } : null;
}

// ─── Crawl one facility ──────────────────────────────────────
interface Row {
  id: number;
  name: string;
  website: string;
}

async function crawlFacility(f: Row): Promise<string> {
  const dir = resolve(CACHE_DIR, String(f.id));
  const manifestPath = resolve(dir, 'manifest.json');
  if (!force && existsSync(manifestPath)) return 'cached';

  const home = await getPage(f.website);
  if (!home) return 'unreachable';
  mkdirSync(dir, { recursive: true });

  const pages: { url: string; rendered: boolean; file: string }[] = [];
  writeFileSync(resolve(dir, 'page-0.txt'), htmlToText(home.html));
  pages.push({ url: f.website, rendered: home.rendered, file: 'page-0.txt' });

  // Pick promising same-host subpages
  let host: string;
  try {
    host = new URL(f.website).host.replace(/^www\./, '');
  } catch {
    host = '';
  }
  const seen = new Set([f.website.replace(/\/$/, '')]);
  const candidates = extractLinks(home.html, f.website)
    .filter((l) => {
      try {
        return new URL(l.href).host.replace(/^www\./, '') === host;
      } catch {
        return false;
      }
    })
    .filter((l) => SUBPAGE_HINT.test(l.href + ' ' + l.text) && !SUBPAGE_AVOID.test(l.href))
    .filter((l) => {
      const key = l.href.replace(/\/$/, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SUBPAGES);

  for (let i = 0; i < candidates.length; i++) {
    const sub = await getPage(candidates[i].href);
    if (!sub) continue;
    const file = `page-${i + 1}.txt`;
    writeFileSync(resolve(dir, file), htmlToText(sub.html));
    pages.push({ url: candidates[i].href, rendered: sub.rendered, file });
  }

  writeFileSync(
    manifestPath,
    JSON.stringify({ facility_id: f.id, name: f.name, website: f.website, crawled_at: new Date().toISOString(), pages }, null, 2)
  );
  return `ok (${pages.length} pages)`;
}

// ─── Main ────────────────────────────────────────────────────
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

  // Global concurrency 6, max 1 in-flight per host
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

  if (browserPromise) await (await browserPromise).close();
  console.log('\nDone:', JSON.stringify(counts));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
