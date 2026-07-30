import { NextRequest, NextResponse } from "next/server";
import { getNearbyFacilities } from "@/lib/queries/facilities";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, { maxRequests: 20, windowMs: 60_000 });
  if (limited) return limited;
  const { searchParams } = request.nextUrl;
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");
  const radius = parseInt(searchParams.get("radius") || "25", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const facilities = await getNearbyFacilities(lat, lng, radius, limit);

  return NextResponse.json({ facilities });
}
