import { getDb } from "@/lib/db";
import type { CountyInfo } from "@/types";

const VISIBLE = `status IN ('imported','approved') AND service_only = 0
  AND (google_business_status IS NULL OR google_business_status != 'CLOSED_PERMANENTLY')`;

interface CountyRow {
  county: string;
  county_slug: string;
  state_slug: string;
  state_abbr: string;
  city_count: number;
  facility_count: number;
}

/** Counties in a state that have at least one visible facility. */
export async function getCountiesByState(stateSlug: string): Promise<CountyInfo[]> {
  try {
    const { results } = await (await getDb())
      .prepare(
        `SELECT co.name AS county, co.slug AS county_slug, s.slug AS state_slug, s.abbr AS state_abbr,
           count(DISTINCT f.city_id) AS city_count,
           count(*) AS facility_count
         FROM facilities f
         JOIN counties co ON co.id = f.county_id
         JOIN states s ON s.id = f.state_id
         WHERE s.slug = ?1 AND ${VISIBLE}
         GROUP BY co.id ORDER BY co.name`
      )
      .bind(stateSlug)
      .all<CountyRow>();
    return results;
  } catch (err) {
    console.error("getCountiesByState error:", err);
    return [];
  }
}

export async function getCountyInfo(
  stateSlug: string,
  countySlug: string
): Promise<CountyInfo | null> {
  try {
    const row = await (await getDb())
      .prepare(
        `SELECT co.name AS county, co.slug AS county_slug, s.slug AS state_slug, s.abbr AS state_abbr,
           count(DISTINCT f.city_id) AS city_count,
           count(*) AS facility_count
         FROM facilities f
         JOIN counties co ON co.id = f.county_id
         JOIN states s ON s.id = f.state_id
         WHERE s.slug = ?1 AND co.slug = ?2 AND ${VISIBLE}
         GROUP BY co.id`
      )
      .bind(stateSlug, countySlug)
      .first<CountyRow>();
    return row ?? null;
  } catch (err) {
    console.error("getCountyInfo error:", err);
    return null;
  }
}
