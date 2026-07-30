import { getDb, parseJson } from "@/lib/db";
import { haversineMiles, bboxDeltas } from "@/lib/utils/geo";
import type { Facility, FacilityCardData, FacilityType } from "@/types";

/**
 * Visibility model (exception-based review, decided 2026-07-30): 'imported'
 * facilities are visible by default — Google-sourced listings that survived
 * ingest filtering are presumptively legit. Manual review in /admin targets
 * only the flagged tail (low review_score, unknown type); 'rejected' hides a
 * listing, 'approved' locks it in. Scripts score but never set status.
 */
export const VISIBLE = `status IN ('imported','approved') AND service_only = 0
  AND (google_business_status IS NULL OR google_business_status != 'CLOSED_PERMANENTLY')`;

export const CARD_FIELDS = `id, slug, state_slug, city_slug, name, city, state_abbr,
  google_rating, google_review_count, facility_type, secondary_types, photo_url, cf_image_id,
  accepted_materials`;

export type CardRow = Omit<FacilityCardData, "secondary_types" | "accepted_materials"> & {
  secondary_types: string;
  accepted_materials: string;
};
type DetailRow = Record<string, unknown>;

export function toCard(row: CardRow): FacilityCardData {
  return {
    ...row,
    secondary_types: parseJson<string[]>(row.secondary_types, []),
    accepted_materials: parseJson<string[]>(row.accepted_materials, []),
  };
}

function toFacility(row: DetailRow): Facility {
  return {
    ...(row as unknown as Facility),
    secondary_types: parseJson<string[]>(row.secondary_types, []),
    google_types: parseJson<string[]>(row.google_types, []),
    google_hours: parseJson<Record<string, string> | null>(row.google_hours, null),
    about: parseJson<Record<string, unknown> | null>(row.about, null),
    accepted_materials: parseJson<string[]>(row.accepted_materials, []),
    fees: parseJson<Record<string, string> | null>(row.fees, null),
    service_only: Boolean(row.service_only),
    is_featured: Boolean(row.is_featured),
    open_to_public: row.open_to_public == null ? null : Boolean(row.open_to_public),
  };
}

/** Facilities in a state that accept a given material (MATERIAL_LABELS key). */
export async function getFacilitiesByMaterial(
  stateSlug: string,
  material: string
): Promise<FacilityCardData[]> {
  try {
    const { results } = await getDb()
      .prepare(
        `SELECT ${CARD_FIELDS} FROM facilities
         WHERE state_slug = ?1 AND ${VISIBLE}
           AND accepted_materials LIKE '%"' || ?2 || '"%'
         ORDER BY google_review_count DESC`
      )
      .bind(stateSlug, material)
      .all<CardRow>();
    return results.map(toCard);
  } catch (err) {
    console.error("getFacilitiesByMaterial error:", err);
    return [];
  }
}

export async function getFacilitiesByState(stateSlug: string): Promise<FacilityCardData[]> {
  try {
    const { results } = await getDb()
      .prepare(
        `SELECT ${CARD_FIELDS} FROM facilities WHERE state_slug = ?1 AND ${VISIBLE}
         ORDER BY google_review_count DESC`
      )
      .bind(stateSlug)
      .all<CardRow>();
    return results.map(toCard);
  } catch (err) {
    console.error("getFacilitiesByState error:", err);
    return [];
  }
}

export async function getFacilitiesByCity(
  stateSlug: string,
  citySlug: string
): Promise<FacilityCardData[]> {
  try {
    const { results } = await getDb()
      .prepare(
        `SELECT ${CARD_FIELDS} FROM facilities
         WHERE state_slug = ?1 AND city_slug = ?2 AND ${VISIBLE}
         ORDER BY google_review_count DESC`
      )
      .bind(stateSlug, citySlug)
      .all<CardRow>();
    return results.map(toCard);
  } catch (err) {
    console.error("getFacilitiesByCity error:", err);
    return [];
  }
}

export async function getFacilityBySlug(
  stateSlug: string,
  citySlug: string,
  slug: string
): Promise<Facility | null> {
  try {
    const row = await getDb()
      .prepare(
        `SELECT * FROM facilities
         WHERE state_slug = ?1 AND city_slug = ?2 AND slug = ?3 AND ${VISIBLE}`
      )
      .bind(stateSlug, citySlug, slug)
      .first<DetailRow>();
    return row ? toFacility(row) : null;
  } catch (err) {
    console.error("getFacilityBySlug error:", err);
    return null;
  }
}

export async function getTopRatedFacilitiesByState(
  stateSlug: string,
  limit = 5
): Promise<FacilityCardData[]> {
  try {
    const { results } = await getDb()
      .prepare(
        `SELECT ${CARD_FIELDS} FROM facilities
         WHERE state_slug = ?1 AND ${VISIBLE} AND google_rating IS NOT NULL
           AND facility_type != 'unknown'
         ORDER BY google_rating DESC, google_review_count DESC LIMIT ?2`
      )
      .bind(stateSlug, limit)
      .all<CardRow>();
    return results.map(toCard);
  } catch (err) {
    console.error("getTopRatedFacilitiesByState error:", err);
    return [];
  }
}

export async function getFacilitiesByStateAndType(
  stateSlug: string,
  facilityType: FacilityType
): Promise<FacilityCardData[]> {
  try {
    const { results } = await getDb()
      .prepare(
        `SELECT ${CARD_FIELDS} FROM facilities
         WHERE state_slug = ?1 AND ${VISIBLE}
           AND (facility_type = ?2 OR secondary_types LIKE ?3)
         ORDER BY google_review_count DESC`
      )
      .bind(stateSlug, facilityType, `%${facilityType}%`)
      .all<CardRow>();
    return results.map(toCard);
  } catch (err) {
    console.error("getFacilitiesByStateAndType error:", err);
    return [];
  }
}

export async function getFacilitiesByCounty(
  stateSlug: string,
  countySlug: string
): Promise<FacilityCardData[]> {
  try {
    const { results } = await getDb()
      .prepare(
        `SELECT ${CARD_FIELDS} FROM facilities
         WHERE state_slug = ?1 AND ${VISIBLE}
           AND county_id = (SELECT c.id FROM counties c
             JOIN states s ON s.id = c.state_id
             WHERE c.slug = ?2 AND s.slug = ?1)
         ORDER BY google_review_count DESC`
      )
      .bind(stateSlug, countySlug)
      .all<CardRow>();
    return results.map(toCard);
  } catch (err) {
    console.error("getFacilitiesByCounty error:", err);
    return [];
  }
}

export interface NearbyFacility extends FacilityCardData {
  lat: number;
  lng: number;
  distance_miles: number;
}

export async function getNearbyFacilities(
  centerLat: number,
  centerLng: number,
  radiusMiles = 30,
  limit = 30,
  facilityType?: FacilityType
): Promise<NearbyFacility[]> {
  try {
    const { latDelta, lngDelta } = bboxDeltas(centerLat, radiusMiles);
    const typeFilter = facilityType ? `AND (facility_type = ?5 OR secondary_types LIKE ?6)` : "";
    let stmt = getDb().prepare(
      `SELECT ${CARD_FIELDS}, lat, lng FROM facilities
       WHERE ${VISIBLE} AND lat BETWEEN ?1 AND ?2 AND lng BETWEEN ?3 AND ?4 ${typeFilter}`
    );
    stmt = facilityType
      ? stmt.bind(
          centerLat - latDelta, centerLat + latDelta,
          centerLng - lngDelta, centerLng + lngDelta,
          facilityType, `%${facilityType}%`
        )
      : stmt.bind(
          centerLat - latDelta, centerLat + latDelta,
          centerLng - lngDelta, centerLng + lngDelta
        );
    const { results } = await stmt.all<CardRow & { lat: number; lng: number }>();
    return results
      .map((row) => ({
        ...toCard(row),
        lat: row.lat,
        lng: row.lng,
        distance_miles:
          Math.round(haversineMiles(centerLat, centerLng, row.lat, row.lng) * 10) / 10,
      }))
      .filter((f) => f.distance_miles <= radiusMiles)
      .sort((a, b) => a.distance_miles - b.distance_miles)
      .slice(0, limit);
  } catch (err) {
    console.error("getNearbyFacilities error:", err);
    return [];
  }
}

export async function getFeaturedFacilities(limit = 6): Promise<FacilityCardData[]> {
  try {
    // Excludes 'unknown' — unclassified records ordered by review count surface
    // exactly the retail noise (car dealers, Apple Stores) we don't want on the
    // home page.
    const { results } = await getDb()
      .prepare(
        `SELECT ${CARD_FIELDS} FROM facilities
         WHERE ${VISIBLE} AND facility_type != 'unknown'
         ORDER BY google_review_count DESC LIMIT ?1`
      )
      .bind(limit)
      .all<CardRow>();
    return results.map(toCard);
  } catch (err) {
    console.error("getFeaturedFacilities error:", err);
    return [];
  }
}
