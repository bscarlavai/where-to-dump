import { NextRequest } from "next/server";
import { getDb, parseJson } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import type { FacilityCardData } from "@/types";

// Same visibility clause as src/lib/queries/facilities.ts (module-private there).
const VISIBLE = `status IN ('imported','approved') AND service_only = 0
  AND (google_business_status IS NULL OR google_business_status != 'CLOSED_PERMANENTLY')`;

const CARD_FIELDS = `id, slug, state_slug, city_slug, name, city, state_abbr,
  google_rating, google_review_count, facility_type, secondary_types, photo_url, cf_image_id`;

type FacilityRow = Omit<FacilityCardData, "secondary_types"> & { secondary_types: string };

interface CityRow {
  name: string;
  slug: string;
  state_slug: string;
  state_abbr: string;
  facility_count: number;
}

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, { maxRequests: 30, windowMs: 60_000 });
  if (limited) return limited;
  const q = request.nextUrl.searchParams.get("q")?.trim();

  if (!q || q.length === 0) {
    return Response.json({ facilities: [], cities: [] });
  }

  const pattern = `%${q}%`;
  const db = getDb();

  try {
    const [facilitiesResult, citiesResult] = await Promise.all([
      db
        .prepare(
          `SELECT ${CARD_FIELDS} FROM facilities
           WHERE ${VISIBLE}
             AND (name LIKE ?1 OR city LIKE ?1 OR state_abbr LIKE ?1)
           ORDER BY google_review_count DESC
           LIMIT 20`
        )
        .bind(pattern)
        .all<FacilityRow>(),
      db
        .prepare(
          `SELECT c.name, c.slug, s.slug AS state_slug, s.abbr AS state_abbr,
             count(*) AS facility_count
           FROM facilities f
           JOIN cities c ON c.id = f.city_id
           JOIN states s ON s.id = f.state_id
           WHERE ${VISIBLE} AND c.name LIKE ?1
           GROUP BY c.id
           ORDER BY facility_count DESC
           LIMIT 10`
        )
        .bind(pattern)
        .all<CityRow>(),
    ]);

    return Response.json({
      facilities: facilitiesResult.results.map((row) => ({
        ...row,
        secondary_types: parseJson<string[]>(row.secondary_types, []),
      })),
      cities: citiesResult.results,
    });
  } catch (err) {
    console.error("Search error:", err);
    return Response.json({ facilities: [], cities: [] }, { status: 500 });
  }
}
