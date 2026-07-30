/**
 * Load .env.local into process.env (same pattern as the sister-site scripts).
 * Existing env vars win over file values.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

export function loadEnvLocal(root: string): void {
  try {
    const envContent = readFileSync(resolve(root, '.env.local'), 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    console.warn('Warning: could not load .env.local');
  }
}
