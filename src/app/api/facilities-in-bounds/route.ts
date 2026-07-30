import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { haversineMiles } from "@/lib/utils/geo";
import { rateLimit } from "@/lib/rate-limit";
import { VISIBLE, CARD_FIELDS, toCard, type CardRow } from "@/lib/queries/facilities";

type BoundsRow = CardRow & {
  lat: number;
  lng: number;
};

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, { maxRequests: 20, windowMs: 60_000 });
  if (limited) return limited;
  const { searchParams } = request.nextUrl;
  const swLat = parseFloat(searchParams.get("sw_lat") || "");
  const swLng = parseFloat(searchParams.get("sw_lng") || "");
  const neLat = parseFloat(searchParams.get("ne_lat") || "");
  const neLng = parseFloat(searchParams.get("ne_lng") || "");
  const userLat = parseFloat(searchParams.get("user_lat") || "");
  const userLng = parseFloat(searchParams.get("user_lng") || "");
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  if ([swLat, swLng, neLat, neLng].some(isNaN)) {
    return NextResponse.json(
      { error: "sw_lat, sw_lng, ne_lat, and ne_lng are required" },
      { status: 400 }
    );
  }

  const hasUserLocation = !isNaN(userLat) && !isNaN(userLng);

  try {
    const { results: rows } = await (await getDb())
      .prepare(
        `SELECT ${CARD_FIELDS}, lat, lng FROM facilities
         WHERE ${VISIBLE}
           AND lat BETWEEN ?1 AND ?2 AND lng BETWEEN ?3 AND ?4
         ORDER BY google_rating IS NULL, google_rating DESC
         LIMIT ?5`
      )
      .bind(swLat, neLat, swLng, neLng, limit)
      .all<BoundsRow>();

    const results = rows.map((row) => ({
      ...toCard(row),
      lat: row.lat,
      lng: row.lng,
      distance_miles: hasUserLocation
        ? Math.round(haversineMiles(userLat, userLng, row.lat, row.lng) * 10) / 10
        : null,
    }));

    if (hasUserLocation) {
      results.sort((a, b) => (a.distance_miles ?? 0) - (b.distance_miles ?? 0));
    }

    return NextResponse.json({ facilities: results });
  } catch (err) {
    console.error("Bounds query error:", err);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
