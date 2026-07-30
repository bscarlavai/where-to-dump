/**
 * One-shot cleanup: strip encoded tracking junk (utm_*, fbclid, gclid) from
 * facilities.website in local D1. New imports are cleaned at import time
 * (import-facilities.ts); this fixes rows already loaded.
 *
 * Usage: npx tsx scripts/maintenance/clean-website-urls.ts [--dry-run]
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { d1Query, d1ExecFile } from '../lib/d1';
import { cleanWebsiteUrl } from '../../src/lib/utils/url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');
const dryRun = process.argv.includes('--dry-run');

const rows = d1Query<{ id: number; website: string }>(root,
  `SELECT id, website FROM facilities WHERE website IS NOT NULL`
);

const changes = rows
  .map((r) => ({ id: r.id, before: r.website, after: cleanWebsiteUrl(r.website) }))
  .filter((c) => c.after !== c.before);

console.log(`${changes.length} of ${rows.length} websites need cleaning`);
for (const c of changes.slice(0, 8)) console.log(`  ${c.before}\n    -> ${c.after}`);
if (dryRun || changes.length === 0) process.exit(0);

const esc = (v: string) => v.replace(/'/g, "''");
const sqlPath = resolve(root, 'db', 'update-clean-websites.sql');
writeFileSync(
  sqlPath,
  changes
    .map((c) => `UPDATE facilities SET website = ${c.after ? `'${esc(c.after)}'` : 'NULL'}, updated_at = datetime('now') WHERE id = ${c.id};`)
    .join('\n') + '\n'
);
d1ExecFile(root, sqlPath);
console.log('Done.');
