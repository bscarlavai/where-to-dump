/**
 * Facility photo pipeline: local D1 → download Google photo → buffer-upload to
 * Cloudflare Images → write cf_image_id back to D1.
 *
 * Google photo URLs (lh3/lh5.googleusercontent.com) mostly refuse hotlinking,
 * so the site can't render them directly. This uploads each one once to
 * Cloudflare Images and the site serves imagedelivery.net URLs instead
 * (src/lib/cloudflare-images.ts).
 *
 * Also maintains outscraper-data/cf-images-map.json (place_id → cf_image_id)
 * so image IDs survive local D1 rebuilds and flow into the remote import —
 * reruns never re-upload a photo that's already in the map.
 *
 * Env (.env.local): CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_IMAGES_API_TOKEN
 *   Token: dash.cloudflare.com → My Profile → API Tokens → Create Token →
 *   custom token with Account > Cloudflare Images > Edit.
 *
 * Usage:
 *   npx tsx scripts/images/upload-photos.ts --setup-variants  # one-time: create detail/card/thumbnail variants
 *   npx tsx scripts/images/upload-photos.ts --limit 5         # test batch
 *   npx tsx scripts/images/upload-photos.ts --dry-run
 *   npx tsx scripts/images/upload-photos.ts                   # all facilities missing cf_image_id
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadEnvLocal } from '../lib/env';
import { d1Query, d1ExecFile } from '../lib/d1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');

loadEnvLocal(root);

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_IMAGES_API_TOKEN;
const API_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/images/v1`;

const MAP_PATH = resolve(root, 'outscraper-data', 'cf-images-map.json');
const UPDATE_SQL_PATH = resolve(root, 'db', 'update-cf-images.sql');

const DELAY_MS = 250;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const dryRun = process.argv.includes('--dry-run');
const setupVariants = process.argv.includes('--setup-variants');
const limit = argValue('--limit') ? Number(argValue('--limit')) : null;

function requireCreds(): void {
  if (!ACCOUNT_ID || !API_TOKEN) {
    console.error(
      'Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_IMAGES_API_TOKEN in .env.local.\n' +
      'Create a token at dash.cloudflare.com → My Profile → API Tokens with Account > Cloudflare Images > Edit.'
    );
    process.exit(1);
  }
}

async function cfApi(path: string, init?: RequestInit): Promise<{ success: boolean; result?: unknown; errors?: { message: string }[] }> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${API_TOKEN}`, ...(init?.headers ?? {}) },
  });
  return res.json() as Promise<{ success: boolean; result?: unknown; errors?: { message: string }[] }>;
}

// ─── Variants: match the site's ImageVariant type (src/lib/cloudflare-images.ts) ───
const VARIANTS = [
  { id: 'detail', options: { fit: 'cover', width: 1200, height: 800, metadata: 'none' } },
  { id: 'card', options: { fit: 'cover', width: 600, height: 400, metadata: 'none' } },
  { id: 'thumbnail', options: { fit: 'cover', width: 300, height: 300, metadata: 'none' } },
];

async function createVariants(): Promise<void> {
  for (const v of VARIANTS) {
    const result = await cfApi('/variants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(v),
    });
    if (result.success) {
      console.log(`Variant "${v.id}" created (${v.options.width}x${v.options.height})`);
    } else {
      const msg = result.errors?.map((e) => e.message).join(', ') ?? 'unknown error';
      // 409/duplicate means it already exists — fine
      console.log(`Variant "${v.id}": ${msg}`);
    }
  }
}

interface FacilityRow {
  id: number;
  place_id: string | null;
  name: string;
  city: string | null;
  state_abbr: string;
  photo_url: string | null;
  cf_image_id: string | null;
}

// ─── Cloudflare Images upload ────────────────────────────────
async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Referer': 'https://www.google.com/',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength < 1024) throw new Error('image too small (<1KB)');
  return Buffer.from(buf);
}

async function uploadToCloudflare(buffer: Buffer, metadata: Record<string, string>): Promise<string> {
  const form = new FormData();
  const filename = `${metadata.slugish ?? 'facility'}.jpg`;
  form.append('file', new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' }), filename);
  form.append('metadata', JSON.stringify(metadata));

  const result = await cfApi('', { method: 'POST', body: form });
  const id = (result.result as { id?: string } | undefined)?.id;
  if (!result.success || !id) {
    throw new Error(result.errors?.map((e) => e.message).join(', ') || 'upload failed');
  }
  return id;
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  if (!dryRun) requireCreds();

  if (setupVariants) {
    await createVariants();
    return;
  }

  // place_id → cf_image_id map survives D1 rebuilds
  const map: Record<string, string> = existsSync(MAP_PATH)
    ? JSON.parse(readFileSync(MAP_PATH, 'utf-8'))
    : {};

  const rows = d1Query<FacilityRow>(root,
    `SELECT id, place_id, name, city, state_abbr, photo_url, cf_image_id
     FROM facilities
     WHERE photo_url IS NOT NULL AND cf_image_id IS NULL
     ORDER BY id`
  );

  const pending = limit ? rows.slice(0, limit) : rows;
  console.log(`${rows.length} facilities need a cf_image_id${limit ? ` (processing ${pending.length})` : ''}\n`);
  if (pending.length === 0) return;

  const updates: { id: number; cfImageId: string }[] = [];
  let uploaded = 0;
  let fromMap = 0;
  let failed = 0;
  const failures: { name: string; error: string }[] = [];

  for (let i = 0; i < pending.length; i++) {
    const f = pending[i];
    const label = `[${i + 1}/${pending.length}] ${f.name} (${f.city ?? '?'}, ${f.state_abbr})`;

    // Already uploaded in a previous run (D1 was rebuilt) — just relink
    const known = f.place_id ? map[f.place_id] : undefined;
    if (known) {
      updates.push({ id: f.id, cfImageId: known });
      fromMap++;
      console.log(`${label} — relinked from map`);
      continue;
    }

    if (dryRun) {
      console.log(`${label} — would upload`);
      continue;
    }

    try {
      const buf = await downloadImage(f.photo_url!);
      const cfImageId = await uploadToCloudflare(buf, {
        site: 'wheretodump',
        place_id: f.place_id ?? '',
        name: f.name,
        state: f.state_abbr,
        city: f.city ?? '',
        slugish: f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      });
      updates.push({ id: f.id, cfImageId });
      if (f.place_id) map[f.place_id] = cfImageId;
      uploaded++;
      console.log(`${label} — uploaded (${cfImageId.slice(0, 12)}...)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed++;
      failures.push({ name: f.name, error: msg });
      console.log(`${label} — FAILED: ${msg}`);
    }

    await delay(DELAY_MS);
  }

  if (dryRun) return;

  // Persist the map before touching D1 — uploads are the unrecoverable part
  writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));

  if (updates.length > 0) {
    const sql = updates
      .map((u) => `UPDATE facilities SET cf_image_id = '${u.cfImageId}', updated_at = datetime('now') WHERE id = ${u.id};`)
      .join('\n');
    writeFileSync(UPDATE_SQL_PATH, sql + '\n');
    d1ExecFile(root, UPDATE_SQL_PATH);
  }

  console.log(`\nDone. Uploaded: ${uploaded}, relinked from map: ${fromMap}, failed: ${failed}`);
  if (failures.length > 0) {
    console.log('Failures (photo_url kept for retry; most are dead Google URLs):');
    for (const f of failures.slice(0, 20)) console.log(`  ${f.name}: ${f.error}`);
    if (failures.length > 20) console.log(`  ... and ${failures.length - 20} more`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
