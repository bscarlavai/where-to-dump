/**
 * Local D1 access for scripts, via wrangler CLI.
 */

import { execFileSync } from 'child_process';

const DB_NAME = 'wheretodump-db';

export function d1Query<T>(root: string, sql: string): T[] {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB_NAME, '--local', '--json', '--command', sql],
    { cwd: root, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }
  );
  // wrangler may prefix the JSON with log lines — parse from the first '['
  const parsed = JSON.parse(out.slice(out.indexOf('['))) as { results: T[] }[];
  return parsed[0]?.results ?? [];
}

export function d1ExecFile(root: string, filePath: string): void {
  execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB_NAME, '--local', '--file', filePath],
    { cwd: root, stdio: 'inherit' }
  );
}
