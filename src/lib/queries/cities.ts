import { getDb } from "@/lib/db";
import { haversineMiles } from "@/lib/utils/geo";
import type { City } from "@/types";

const VISIBLE = `status IN ('imported','approved') AND service_only = 0
  AND (google_business_status IS NULL OR google_business_status != 'CLOSED_PERMANENTLY')`;

interface CityRow {
  id: number;
  name: string;
  slug: string;
  state_slug: string;
  state_abbr: string;
  county: string | null;
  county_slug: string | null;
  facility_count: number;
  lat: number | null;
  lng: number | null;
}

/**
 * City coordinates are the average of its visible facilities' coordinates —
 * the cities table intentionally has no lat/lng.
 */
const CITY_SELECT = `
  SELECT c.id, c.name, c.slug, s.slug AS state_slug, s.abbr AS state_abbr,
    co.name AS county, co.slug AS county_slug,
    count(*) AS facility_count, avg(f.lat) AS lat, avg(f.lng) AS lng
  FROM facilities f
  JOIN cities c ON c.id = f.city_id
  JOIN states s ON s.id = f.state_id
  LEFT JOIN counties co ON co.id = c.county_id`;

export async function getCitiesByState(stateSlug: string): Promise<City[]> {
  try {
    const { results } = await getDb()
      .prepare(`${CITY_SELECT} WHERE s.slug = ?1 AND ${VISIBLE} GROUP BY c.id ORDER BY c.name`)
      .bind(stateSlug)
      .all<CityRow>();
    return results;
  } catch (err) {
    console.error("getCitiesByState error:", err);
    return [];
  }
}

export async function getCityBySlug(stateSlug: string, citySlug: string): Promise<City | null> {
  try {
    const row = await getDb()
      .prepare(`${CITY_SELECT} WHERE s.slug = ?1 AND c.slug = ?2 AND ${VISIBLE} GROUP BY c.id`)
      .bind(stateSlug, citySlug)
      .first<CityRow>();
    return row ?? null;
  } catch (err) {
    console.error("getCityBySlug error:", err);
    return null;
  }
}

/** Other cities with facilities within radius of the given city. */
export async function getNearbyCities(
  stateSlug: string,
  citySlug: string,
  radiusMiles = 50,
  limit = 12
): Promise<Array<City & { distance_miles: number }>> {
  try {
    const center = await getCityBySlug(stateSlug, citySlug);
    if (!center || center.lat == null || center.lng == null) return [];
    const all = await getCitiesByState(stateSlug);
    return all
      .filter((c) => c.slug !== citySlug && c.lat != null && c.lng != null)
      .map((c) => ({
        ...c,
        distance_miles:
          Math.round(haversineMiles(center.lat!, center.lng!, c.lat!, c.lng!) * 10) / 10,
      }))
      .filter((c) => c.distance_miles <= radiusMiles)
      .sort((a, b) => a.distance_miles - b.distance_miles)
      .slice(0, limit);
  } catch (err) {
    console.error("getNearbyCities error:", err);
    return [];
  }
}
