import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Minimal structural typing for the D1 binding so we don't need
 * @cloudflare/workers-types as a dependency.
 */
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: { changes?: number } }>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

/** The D1 binding configured in wrangler.jsonc. Works in `next dev` via
 * initOpenNextCloudflareForDev() in next.config.ts. Async so statically
 * prerendered routes (sitemaps, ISR pages) can run at build time — the async
 * context resolves to local bindings during `next build`. */
export async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error("D1 binding DB is not configured (check wrangler.jsonc)");
  return db;
}

/** Parse a JSON TEXT column, returning fallback on null/garbage. */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}
