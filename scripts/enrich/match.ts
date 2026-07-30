/**
 * Reusable facility matcher for enrichment joins (EPA LMOP, state permit DBs).
 *
 * External records rarely share IDs with Google Places data, so we match on
 * normalized-name token overlap plus geographic distance and bucket results:
 *   - auto:   safe to write to D1 without a human look
 *   - review: plausible, print for a human decision
 *   - none:   no acceptable candidate
 */

import { haversineMiles } from '../../src/lib/utils/geo';

export interface MatchSource {
  name: string;
  lat: number | null;
  lng: number | null;
  county?: string | null;
}

export interface MatchTarget {
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
  county?: string | null;
}

export interface MatchResult<T extends MatchTarget> {
  target: T;
  nameScore: number;      // 0-1 token overlap
  distanceMiles: number | null;
  tier: 'auto' | 'review';
}

// Filler tokens that inflate overlap without identifying anything
const STOPWORDS = new Set([
  'landfill', 'lf', 'inc', 'llc', 'co', 'corp', 'company', 'county', 'city',
  'of', 'the', 'and', 'sanitary', 'sanitation', 'municipal', 'solid', 'waste',
  'disposal', 'facility', 'site', 'services', 'service', 'management', 'swmd',
  'district', 'recycling', 'transfer', 'station', 'north', 'south', 'east', 'west',
]);

const EXPANSIONS: Record<string, string> = {
  lfs: 'landfill',
  rdf: 'disposal',
  'ctr': 'center',
};

export function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((t) => EXPANSIONS[t] ?? t)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t))
  );
}

function tokenOverlap(a: Set<string>, b: Set<string>): { score: number; shared: number } {
  if (a.size === 0 || b.size === 0) return { score: 0, shared: 0 };
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return { score: shared / Math.min(a.size, b.size), shared };
}

/**
 * Find the best target for one source record.
 *
 * A single shared distinctive token (often just the county name) is NOT
 * enough for auto — it mismatches closed landfills to whatever nearby entity
 * shares the county word. Auto needs either two shared tokens or coordinates
 * that are effectively the same site (<= 0.3mi).
 *
 * Tiers:
 *   auto:   distance <= 0.3mi with any name signal, OR
 *           shared >= 2 tokens AND (distance <= 1.5mi with score >= 0.5, or
 *           score = 1 with distance <= 5mi, or score = 1 same-county no coords)
 *   review: distance <= 3mi with some name signal, or score >= 0.75 in the
 *           same county.
 */
export function bestMatch<T extends MatchTarget>(
  source: MatchSource,
  targets: T[]
): MatchResult<T> | null {
  const srcTokens = nameTokens(source.name);
  const srcCounty = source.county?.toLowerCase().replace(/\s*county\s*$/i, '') ?? null;

  let best: MatchResult<T> | null = null;

  for (const t of targets) {
    const { score: nameScore, shared } = tokenOverlap(srcTokens, nameTokens(t.name));
    const distanceMiles =
      source.lat != null && source.lng != null && t.lat != null && t.lng != null
        ? haversineMiles(source.lat, source.lng, t.lat, t.lng)
        : null;
    const tgtCounty = t.county?.toLowerCase().replace(/\s*county\s*$/i, '') ?? null;
    const sameCounty = srcCounty != null && tgtCounty != null && srcCounty === tgtCounty;

    let tier: 'auto' | 'review' | null = null;
    if (distanceMiles != null) {
      if (
        (distanceMiles <= 0.3 && nameScore > 0) ||
        (shared >= 2 &&
          ((distanceMiles <= 1.5 && nameScore >= 0.5) || (nameScore === 1 && distanceMiles <= 5)))
      ) {
        tier = 'auto';
      } else if (distanceMiles <= 3 && nameScore >= 0.25) {
        tier = 'review';
      }
    } else if (nameScore === 1 && shared >= 2 && sameCounty) {
      tier = 'auto';
    } else if (nameScore >= 0.75 && sameCounty) {
      tier = 'review';
    }
    if (!tier) continue;

    const candidate: MatchResult<T> = { target: t, nameScore, distanceMiles, tier };
    if (
      !best ||
      (candidate.tier === 'auto' && best.tier !== 'auto') ||
      (candidate.tier === best.tier &&
        (candidate.nameScore > best.nameScore ||
          (candidate.nameScore === best.nameScore &&
            (candidate.distanceMiles ?? 99) < (best.distanceMiles ?? 99))))
    ) {
      best = candidate;
    }
  }

  return best;
}
