import { getDb } from "@/lib/db";
import { SLUG_TO_ABBR, STATE_SLUGS } from "@/lib/utils/states";
import type { State } from "@/types";

const VISIBLE = `status IN ('imported','approved') AND service_only = 0
  AND (google_business_status IS NULL OR google_business_status != 'CLOSED_PERMANENTLY')`;

interface StateRow {
  id: number;
  name: string;
  abbr: string;
  slug: string;
  facility_count: number;
}

function toState(row: StateRow): State {
  return {
    id: row.id,
    name: row.name,
    abbreviation: row.abbr,
    slug: row.slug,
    facility_count: row.facility_count,
  };
}

/** States that have at least one visible facility, with counts. */
export async function getAllStates(): Promise<State[]> {
  try {
    const { results } = await (await getDb())
      .prepare(
        `SELECT s.id, s.name, s.abbr, s.slug,
           (SELECT count(*) FROM facilities f WHERE f.state_id = s.id AND ${VISIBLE}) AS facility_count
         FROM states s ORDER BY s.name`
      )
      .all<StateRow>();
    return results.filter((r) => r.facility_count > 0).map(toState);
  } catch (err) {
    console.error("getAllStates error:", err);
    return [];
  }
}

export async function getStateBySlug(slug: string): Promise<State | null> {
  try {
    const row = await (await getDb())
      .prepare(
        `SELECT s.id, s.name, s.abbr, s.slug,
           (SELECT count(*) FROM facilities f WHERE f.state_id = s.id AND ${VISIBLE}) AS facility_count
         FROM states s WHERE s.slug = ?1`
      )
      .bind(slug)
      .first<StateRow>();
    return row ? toState(row) : null;
  } catch (err) {
    console.error("getStateBySlug error:", err);
    return null;
  }
}

/** Static US state adjacency (by abbreviation). */
const ADJACENT: Record<string, string[]> = {
  AL: ["GA", "FL", "MS", "TN"],
  AK: [],
  AZ: ["CA", "NV", "UT", "CO", "NM"],
  AR: ["MO", "TN", "MS", "LA", "TX", "OK"],
  CA: ["OR", "NV", "AZ"],
  CO: ["WY", "NE", "KS", "OK", "NM", "UT", "AZ"],
  CT: ["NY", "MA", "RI"],
  DE: ["MD", "PA", "NJ"],
  FL: ["GA", "AL"],
  GA: ["FL", "AL", "TN", "NC", "SC"],
  HI: [],
  ID: ["WA", "OR", "NV", "UT", "WY", "MT"],
  IL: ["WI", "IA", "MO", "KY", "IN"],
  IN: ["IL", "KY", "OH", "MI"],
  IA: ["MN", "WI", "IL", "MO", "NE", "SD"],
  KS: ["NE", "MO", "OK", "CO"],
  KY: ["IL", "IN", "OH", "WV", "VA", "TN", "MO"],
  LA: ["TX", "AR", "MS"],
  ME: ["NH"],
  MD: ["VA", "WV", "PA", "DE", "DC"],
  MA: ["RI", "CT", "NY", "NH", "VT"],
  MI: ["OH", "IN", "WI"],
  MN: ["WI", "IA", "SD", "ND"],
  MS: ["LA", "AR", "TN", "AL"],
  MO: ["IA", "IL", "KY", "TN", "AR", "OK", "KS", "NE"],
  MT: ["ND", "SD", "WY", "ID"],
  NE: ["SD", "IA", "MO", "KS", "CO", "WY"],
  NV: ["OR", "ID", "UT", "AZ", "CA"],
  NH: ["VT", "ME", "MA"],
  NJ: ["DE", "PA", "NY"],
  NM: ["AZ", "UT", "CO", "OK", "TX"],
  NY: ["NJ", "PA", "VT", "MA", "CT"],
  NC: ["VA", "TN", "GA", "SC"],
  ND: ["MN", "SD", "MT"],
  OH: ["PA", "WV", "KY", "IN", "MI"],
  OK: ["KS", "MO", "AR", "TX", "NM", "CO"],
  OR: ["WA", "ID", "NV", "CA"],
  PA: ["NY", "NJ", "DE", "MD", "WV", "OH"],
  RI: ["CT", "MA"],
  SC: ["GA", "NC"],
  SD: ["ND", "MN", "IA", "NE", "WY", "MT"],
  TN: ["KY", "VA", "NC", "GA", "AL", "MS", "AR", "MO"],
  TX: ["NM", "OK", "AR", "LA"],
  UT: ["ID", "WY", "CO", "NM", "AZ", "NV"],
  VT: ["NY", "NH", "MA"],
  VA: ["NC", "TN", "KY", "WV", "MD", "DC"],
  WA: ["ID", "OR"],
  WV: ["OH", "PA", "MD", "VA", "KY"],
  WI: ["MI", "MN", "IA", "IL"],
  WY: ["MT", "SD", "NE", "CO", "UT", "ID"],
  DC: ["MD", "VA"],
};

/** Adjacent states that actually have facilities. */
export async function getNearbyStates(stateSlug: string, limit = 4): Promise<State[]> {
  const abbr = SLUG_TO_ABBR[stateSlug];
  if (!abbr) return [];
  const neighborSlugs = (ADJACENT[abbr] ?? [])
    .map((a) => STATE_SLUGS[a])
    .filter(Boolean);
  if (neighborSlugs.length === 0) return [];
  const all = await getAllStates();
  return all.filter((s) => neighborSlugs.includes(s.slug)).slice(0, limit);
}
