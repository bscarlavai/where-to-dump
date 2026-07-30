/**
 * Shared polite-crawl helpers for enrichment scrapers (facility sites, SWMD
 * district sites). Plain fetch first, Playwright chromium fallback for JS
 * shells; visible-text extraction with no HTML parser dependency.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

export const UA = 'Mozilla/5.0 (compatible; WhereToDumpBot/1.0; +https://wheretodump.com)';
const PAGE_TIMEOUT_MS = 15_000;

export const SUBPAGE_HINT = /fee|rate|pric|tip|dispos|accept|material|recycl|drop.?off|residen|faq|service|waste|landfill|transfer|hhw|hazard|tox|compost|convenience/i;
export const SUBPAGE_AVOID = /login|account|career|news|blog|event|contact|privacy|terms|facebook|twitter|instagram|youtube|linkedin|\.(pdf|jpg|png|zip|doc)/i;

export function htmlToText(html: string): string {
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

export function extractLinks(html: string, base: string): { href: string; text: string }[] {
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

// Lazy Playwright so plain-fetch runs never need chromium
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

export async function getPage(url: string): Promise<{ html: string; rendered: boolean } | null> {
  const html = await fetchPage(url);
  if (html && htmlToText(html).length >= 400) return { html, rendered: false };
  const rendered = await renderPage(url);
  if (rendered && htmlToText(rendered).length >= 200) return { html: rendered, rendered: true };
  return html ? { html, rendered: false } : null;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) await (await browserPromise).close();
  browserPromise = null;
}

export interface CrawledPage {
  url: string;
  rendered: boolean;
  file: string;
}

/**
 * Crawl a site's homepage plus up to maxSubpages same-host relevant subpages
 * into dir as page-N.txt files. Returns the page list for the manifest, or
 * null when the homepage is unreachable.
 */
export async function crawlSite(
  website: string,
  dir: string,
  maxSubpages: number
): Promise<CrawledPage[] | null> {
  const home = await getPage(website);
  if (!home) return null;
  mkdirSync(dir, { recursive: true });

  const pages: CrawledPage[] = [];
  writeFileSync(resolve(dir, 'page-0.txt'), htmlToText(home.html));
  pages.push({ url: website, rendered: home.rendered, file: 'page-0.txt' });

  let host: string;
  try {
    host = new URL(website).host.replace(/^www\./, '');
  } catch {
    host = '';
  }
  const seen = new Set([website.replace(/\/$/, '')]);
  const candidates = extractLinks(home.html, website)
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
    .slice(0, maxSubpages);

  for (let i = 0; i < candidates.length; i++) {
    const sub = await getPage(candidates[i].href);
    if (!sub) continue;
    const file = `page-${i + 1}.txt`;
    writeFileSync(resolve(dir, file), htmlToText(sub.html));
    pages.push({ url: candidates[i].href, rendered: sub.rendered, file });
  }

  return pages;
}
