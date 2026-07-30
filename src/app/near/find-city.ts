import { getDb } from "@/lib/db";

/** Same visibility rules as src/lib/queries/facilities.ts. */
const VISIBLE = `status IN ('imported','approved') AND service_only = 0
  AND (google_business_status IS NULL OR google_business_status != 'CLOSED_PERMANENTLY')`;

export interface NearCity {
  name: string;
  slug: string;
  state_abbr: string;
  state_slug: string;
  facility_count: number;
  lat: number | null;
  lng: number | null;
}

/**
 * Resolve a bare city slug for /near/ pages. Cities can share slugs across
 * states — pick the one with the most visible facilities. Coordinates are the
 * average of the city's facility coordinates.
 */
export async function findCity(citySlug: string): Promise<NearCity | null> {
  try {
    const row = await getDb()
      .prepare(
        `SELECT c.name, c.slug, s.abbr AS state_abbr, s.slug AS state_slug,
           count(*) AS facility_count, avg(f.lat) AS lat, avg(f.lng) AS lng
         FROM facilities f
         JOIN cities c ON c.id = f.city_id
         JOIN states s ON s.id = f.state_id
         WHERE c.slug = ?1 AND ${VISIBLE}
         GROUP BY c.id, s.id
         ORDER BY facility_count DESC
         LIMIT 1`
      )
      .bind(citySlug)
      .first<NearCity>();
    return row ?? null;
  } catch (err) {
    console.error("findCity error:", err);
    return null;
  }
}
