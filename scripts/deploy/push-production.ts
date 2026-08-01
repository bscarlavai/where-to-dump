/**
 * Push the local D1 database to production, verified.
 *
 * Exports the newest local sqlite (schema DDL + INSERT dump for our five
 * tables, child-first drops for remote FK enforcement), pushes both files
 * with wrangler, then VERIFIES by comparing local vs remote row counts —
 * exits nonzero on any mismatch so a silent wrangler failure can't pass.
 * Retries each push once (remote pushes have failed transiently before).
 *
 * Also refreshes db/production-{schema,data}.sql, which are committed so the
 * Workers Builds CI can seed its build-time database.
 *
 * Usage: npm run push:production
 */

import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, statSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');
const TABLES = ['states', 'counties', 'cities', 'facilities', 'submissions'];
const SCHEMA_PATH = resolve(root, 'db', 'production-schema.sql');
const DATA_PATH = resolve(root, 'db', 'production-data.sql');

function newestSqlite(): string {
  const dir = resolve(root, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => ({ f: resolve(dir, f), m: statSync(resolve(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (!files.length) throw new Error('no local D1 sqlite found');
  return files[0].f;
}

function sqlite(db: string, ...args: string[]): string {
  return execFileSync('sqlite3', [db, ...args], { encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024 });
}

function wranglerRemote(file: string): void {
  execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'wheretodump-db', '--remote', '-y', `--file=${file}`],
    { cwd: root, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 }
  );
}

function pushWithRetry(file: string, label: string): void {
  try {
    wranglerRemote(file);
  } catch (err) {
    console.log(`${label} push failed once, retrying...`);
    wranglerRemote(file);
  }
  console.log(`${label} pushed.`);
}

function remoteCount(table: string): number {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'wheretodump-db', '--remote', '--json',
      '--command', `SELECT COUNT(*) AS n FROM ${table}`],
    { cwd: root, encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 }
  );
  return (JSON.parse(out.slice(out.indexOf('['))) as { results: { n: number }[] }[])[0].results[0].n;
}

const db = newestSqlite();
console.log(`Local DB: ${db}`);

// Export
const ddl = sqlite(
  db,
  `SELECT sql || ';' FROM sqlite_master WHERE type IN ('table','index') AND tbl_name IN (${TABLES.map((t) => `'${t}'`).join(',')}) AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'`
);
writeFileSync(SCHEMA_PATH, [...TABLES].reverse().map((t) => `DROP TABLE IF EXISTS ${t};`).join('\n') + '\n' + ddl);
writeFileSync(DATA_PATH, TABLES.map((t) => sqlite(db, `.mode insert ${t}`, `SELECT * FROM ${t}`)).join(''));

const localCounts = Object.fromEntries(
  TABLES.map((t) => [t, Number(sqlite(db, `SELECT COUNT(*) FROM ${t}`).trim())])
);
console.log('Local counts:', JSON.stringify(localCounts));

// Push
pushWithRetry(SCHEMA_PATH, 'schema');
pushWithRetry(DATA_PATH, 'data');

// Verify
let ok = true;
for (const t of TABLES) {
  const r = remoteCount(t);
  const match = r === localCounts[t];
  if (!match) ok = false;
  console.log(`${t}: local ${localCounts[t]} / remote ${r} ${match ? 'OK' : 'MISMATCH'}`);
}
if (!ok) {
  console.error('\nVERIFICATION FAILED — production does not match local.');
  process.exit(1);
}
console.log('\nProduction verified in sync.');
