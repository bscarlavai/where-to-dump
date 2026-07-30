import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { VISIBLE, CARD_FIELDS, toCard, type CardRow } from "@/lib/queries/facilities";

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
        .all<CardRow>(),
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
      facilities: facilitiesResult.results.map(toCard),
      cities: citiesResult.results,
    });
  } catch (err) {
    console.error("Search error:", err);
    return Response.json({ facilities: [], cities: [] }, { status: 500 });
  }
}
