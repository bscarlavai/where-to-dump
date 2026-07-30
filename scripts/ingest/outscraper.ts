/**
 * Thin Outscraper API client (Google Maps Search v3).
 *
 * Async model: submit queries → receive request id → poll until done.
 * Docs: https://app.outscraper.com/api-docs
 * API key: https://app.outscraper.com/account/api → OUTSCRAPER_API_KEY in .env.local
 */

const API_BASE = 'https://api.app.outscraper.com';

export interface OutscraperPlace {
  place_id: string;
  name: string;
  full_address?: string;
  street?: string;
  city?: string;
  us_state?: string;
  state?: string;
  postal_code?: string;
  county?: string;
  latitude?: number;
  longitude?: number;
  type?: string;
  subtypes?: string;
  category?: string;
  phone?: string;
  website?: string;
  about?: Record<string, unknown>;
  reviews_tags?: string[];
  rating?: number;
  reviews?: number;
  working_hours?: Record<string, string>;
  photo?: string;
  photos_count?: number;
  business_status?: string;
  description?: string;
  [key: string]: unknown;
}

interface SubmitResponse {
  id?: string;
  status?: string;
  results_location?: string;
  data?: OutscraperPlace[][];
}

function apiKey(): string {
  const key = process.env.OUTSCRAPER_API_KEY;
  if (!key) {
    throw new Error(
      'OUTSCRAPER_API_KEY is not set. Generate one at https://app.outscraper.com/account/api and add it to .env.local'
    );
  }
  return key;
}

async function apiGet(url: string): Promise<SubmitResponse> {
  const res = await fetch(url, { headers: { 'X-API-KEY': apiKey() } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Outscraper API ${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
  }
  return (await res.json()) as SubmitResponse;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The API returns data as OutscraperPlace[][] for multi-query requests but as a
 * flat OutscraperPlace[] for single-query requests. Normalize to one array per
 * query.
 */
function normalizeData(data: unknown, queryCount: number): OutscraperPlace[][] {
  if (!Array.isArray(data)) {
    throw new Error(`Unexpected Outscraper data shape: ${JSON.stringify(data).slice(0, 300)}`);
  }
  if (data.length === 0) return Array.from({ length: queryCount }, () => []);
  if (data.every((item) => Array.isArray(item))) return data as OutscraperPlace[][];
  return [data as OutscraperPlace[]];
}

/**
 * Submit search queries and wait for results.
 * Returns one array of places per query, in query order.
 */
export async function searchMaps(
  queries: string[],
  opts: { limitPerQuery: number; region?: string; language?: string; pollIntervalMs?: number; timeoutMs?: number }
): Promise<OutscraperPlace[][]> {
  const params = new URLSearchParams();
  for (const q of queries) params.append('query', q);
  params.set('limit', String(opts.limitPerQuery));
  params.set('language', opts.language ?? 'en');
  params.set('region', opts.region ?? 'US');
  params.set('async', 'true');
  params.set('dropDuplicates', 'true');

  const submitted = await apiGet(`${API_BASE}/maps/search-v3?${params.toString()}`);

  // Small requests may complete synchronously.
  if (submitted.data && !submitted.results_location) {
    return normalizeData(submitted.data, queries.length);
  }

  const pollUrl =
    submitted.results_location ?? (submitted.id ? `${API_BASE}/requests/${submitted.id}` : null);
  if (!pollUrl) {
    throw new Error(`Unexpected Outscraper response: ${JSON.stringify(submitted).slice(0, 500)}`);
  }

  const interval = opts.pollIntervalMs ?? 15_000;
  const deadline = Date.now() + (opts.timeoutMs ?? 30 * 60_000);
  process.stdout.write(`  Request ${submitted.id ?? pollUrl} pending`);
  for (;;) {
    if (Date.now() > deadline) throw new Error(`Outscraper request timed out: ${pollUrl}`);
    await sleep(interval);
    const status = await apiGet(pollUrl);
    if (status.status === 'Pending' || status.status === 'Running') {
      process.stdout.write('.');
      continue;
    }
    process.stdout.write('\n');
    if (status.status === 'Success' || status.status === 'Completed') {
      if (!status.data) throw new Error(`Outscraper request succeeded but returned no data: ${pollUrl}`);
      return normalizeData(status.data, queries.length);
    }
    throw new Error(`Outscraper request failed (status: ${status.status}): ${pollUrl}`);
  }
}
