/**
 * AI review recommendations for the admin queue. Two modes:
 *
 *   --evidence   Gather per-row evidence (score reasons, Google categories,
 *                cached website text from the enrichment crawl) into
 *                enrichment-data/review-evidence-{a,b}.json for subagent
 *                judgment.
 *   --apply      Read enrichment-data/review-recommendations.json (produced
 *                by the judging agents) and stamp admin_notes with
 *                "AI rec: APPROVE|REJECT|UNSURE — <reason>".
 *
 * NEVER touches status — approval stays manual in /admin (standing rule).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { d1Query, d1ExecFile } from '../lib/d1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');
const SITE_CACHE = resolve(root, 'enrichment-data', 'site-cache');
const EVIDENCE_A = resolve(root, 'enrichment-data', 'review-evidence-a.json');
const EVIDENCE_B = resolve(root, 'enrichment-data', 'review-evidence-b.json');
const RECS_PATH = resolve(root, 'enrichment-data', 'review-recommendations.json');
const UPDATE_SQL_PATH = resolve(root, 'db', 'update-recommendations.sql');

const mode = process.argv.includes('--apply') ? 'apply' : 'evidence';

interface Row {
  id: number;
  name: string;
  city: string | null;
  facility_type: string;
  google_primary_type: string | null;
  google_types: string;
  google_review_count: number;
  website: string | null;
  review_score: number | null;
  review_reasons: string;
  source_queries: string;
}

function siteExcerpt(id: number): string | null {
  const manifestPath = resolve(SITE_CACHE, String(id), 'manifest.json');
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { pages: { file: string }[] };
  let text = '';
  for (const page of manifest.pages.slice(0, 2)) {
    const p = resolve(SITE_CACHE, String(id), page.file);
    if (existsSync(p)) text += readFileSync(p, 'utf-8') + '\n';
  }
  return text ? text.replace(/\s+/g, ' ').slice(0, 1400) : null;
}

if (mode === 'evidence') {
  const rows = d1Query<Row>(root,
    `SELECT id, name, city, facility_type, google_primary_type, google_types,
            google_review_count, website, review_score, review_reasons, source_queries
     FROM facilities
     WHERE status = 'imported' AND service_only = 0
       AND (review_score < 60 OR facility_type = 'unknown')
     ORDER BY review_score ASC`
  );
  const evidence = rows.map((r) => ({
    id: r.id,
    name: r.name,
    city: r.city,
    classified_type: r.facility_type,
    google_category: r.google_primary_type,
    google_subtypes: r.google_types,
    reviews: r.google_review_count,
    score: r.review_score,
    score_reasons: r.review_reasons,
    found_via_queries: r.source_queries,
    website: r.website,
    website_text: siteExcerpt(r.id),
  }));
  const half = Math.ceil(evidence.length / 2);
  writeFileSync(EVIDENCE_A, JSON.stringify(evidence.slice(0, half), null, 1));
  writeFileSync(EVIDENCE_B, JSON.stringify(evidence.slice(half), null, 1));
  const withText = evidence.filter((e) => e.website_text).length;
  console.log(`${evidence.length} queue rows (${withText} with cached site text) -> review-evidence-a/b.json`);
} else {
  const recs: { id: number; recommend: string; reason: string }[] = JSON.parse(
    readFileSync(RECS_PATH, 'utf-8')
  );
  const esc = (v: string) => v.replace(/'/g, "''");
  const valid = recs.filter((r) => ['approve', 'reject', 'unsure'].includes(r.recommend));
  writeFileSync(
    UPDATE_SQL_PATH,
    valid
      .map(
        (r) =>
          `UPDATE facilities SET admin_notes = 'AI rec: ${r.recommend.toUpperCase()} — ${esc(r.reason).slice(0, 200)}', updated_at = datetime('now') WHERE id = ${r.id} AND status = 'imported';`
      )
      .join('\n') + '\n'
  );
  d1ExecFile(root, UPDATE_SQL_PATH);
  const counts: Record<string, number> = {};
  for (const r of valid) counts[r.recommend] = (counts[r.recommend] ?? 0) + 1;
  console.log(`Stamped ${valid.length} recommendations:`, JSON.stringify(counts));
}
