/**
 * Score every visible facility 0-100 for the admin review queue.
 *
 * Pure local heuristics over data already in D1 (name, Google category,
 * reviews, website). Writes review_score + review_reasons only — NEVER touches
 * status. Approval and rejection stay manual in /admin.
 *
 * Usage:
 *   npm run score              # score all non-service facilities
 *   npm run score -- --dry-run # print score distribution without writing
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { d1Query, d1ExecFile } from '../lib/d1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');
const dryRun = process.argv.includes('--dry-run');

const UPDATE_SQL_PATH = resolve(root, 'db', 'update-review-scores.sql');

interface Row {
  id: number;
  name: string;
  facility_type: string;
  google_primary_type: string | null;
  google_types: string;
  google_rating: number | null;
  google_review_count: number;
  website: string | null;
}

const WASTE_NAME = /landfill|transfer|recycl|scrap|salvage|waste|disposal|\bdump\b|sanitation|solid waste|compost|convenience cent/i;
const WASTE_CATEGORY = /waste management|recycling|landfill|transfer station|scrap|garbage dump|dump site|hazardous/i;
// Categories that showed up in the unknown bucket and are almost never a
// drop-off facility (see ingest noise history: retail, offices, misc)
const NOISE_CATEGORY = /corporate office|social services|rest stop|truck stop|\bfarm\b|fairground|recreation center|shipping|wholesaler|computer support|paving|construction company|landscaping|fuel supplier|non-?profit|transportation service/i;
const GOV_CATEGORY = /government office|public works|health department/i;

function score(row: Row): { score: number; reasons: string[] } {
  let s = 0;
  const reasons: string[] = [];
  const add = (points: number, why: string) => {
    s += points;
    reasons.push(`${points > 0 ? '+' : ''}${points} ${why}`);
  };

  const types: string[] = JSON.parse(row.google_types || '[]');
  const categoryText = [row.google_primary_type ?? '', ...types].join(' | ');

  if (row.facility_type !== 'unknown') add(40, `classified as ${row.facility_type}`);
  if (WASTE_NAME.test(row.name)) add(25, 'waste keyword in name');
  if (WASTE_CATEGORY.test(categoryText)) add(20, `waste category: ${row.google_primary_type}`);
  if (row.google_review_count >= 5) add(10, `${row.google_review_count} reviews`);
  else if (row.google_review_count >= 1) add(5, `${row.google_review_count} review(s)`);
  else add(-10, 'no reviews');
  if ((row.google_rating ?? 0) >= 4) add(5, `rated ${row.google_rating}`);
  if (row.website) add(5, 'has website');
  if (NOISE_CATEGORY.test(categoryText)) add(-30, `noise category: ${row.google_primary_type}`);
  if (GOV_CATEGORY.test(categoryText) && !WASTE_NAME.test(row.name)) {
    add(-10, 'government office without waste keyword in name');
  }

  return { score: Math.max(0, Math.min(100, s)), reasons };
}

function main() {
  const rows = d1Query<Row>(root,
    `SELECT id, name, facility_type, google_primary_type, google_types,
            google_rating, google_review_count, website
     FROM facilities WHERE service_only = 0`
  );

  const scored = rows.map((r) => ({ id: r.id, name: r.name, ...score(r) }));

  const buckets = { '0-29': 0, '30-59': 0, '60-79': 0, '80-100': 0 };
  for (const f of scored) {
    if (f.score < 30) buckets['0-29']++;
    else if (f.score < 60) buckets['30-59']++;
    else if (f.score < 80) buckets['60-79']++;
    else buckets['80-100']++;
  }
  console.log(`Scored ${scored.length} facilities:`);
  for (const [range, n] of Object.entries(buckets)) console.log(`  ${range}: ${n}`);

  if (dryRun) {
    console.log('\nLowest 15:');
    for (const f of [...scored].sort((a, b) => a.score - b.score).slice(0, 15)) {
      console.log(`  ${f.score} ${f.name} (${f.reasons.join('; ')})`);
    }
    return;
  }

  const esc = (v: string) => v.replace(/'/g, "''");
  const sql = scored
    .map((f) => `UPDATE facilities SET review_score = ${f.score}, review_reasons = '${esc(JSON.stringify(f.reasons))}' WHERE id = ${f.id};`)
    .join('\n');
  writeFileSync(UPDATE_SQL_PATH, sql + '\n');
  d1ExecFile(root, UPDATE_SQL_PATH);
  console.log(`\nWrote scores to D1 (${UPDATE_SQL_PATH})`);
}

main();
