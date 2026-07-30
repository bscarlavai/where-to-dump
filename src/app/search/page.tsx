import type { Metadata } from "next";
import Link from "next/link";
import { getDb, parseJson } from "@/lib/db";
import { getNearbyFacilities } from "@/lib/queries/facilities";
import { FacilityCard } from "@/components/FacilityCard";
import Breadcrumb from "@/components/Breadcrumb";
import { canonicalUrl } from "@/app/seo";
import type { FacilityCardData } from "@/types";

export const metadata: Metadata = {
  title: "Search Results",
  description: "Search results for landfills, transfer stations, recycling centers, and other waste disposal facilities.",
  alternates: { canonical: canonicalUrl("/search") },
};

/** Same visibility rules as src/lib/queries/facilities.ts. */
const VISIBLE = `status IN ('imported','approved') AND service_only = 0
  AND (google_business_status IS NULL OR google_business_status != 'CLOSED_PERMANENTLY')`;

const CARD_FIELDS = `id, slug, state_slug, city_slug, name, city, state_abbr,
  google_rating, google_review_count, facility_type, secondary_types, photo_url, cf_image_id`;

type CardRow = Omit<FacilityCardData, "secondary_types"> & { secondary_types: string };

interface CityResult {
  id: number;
  name: string;
  slug: string;
  state_slug: string;
  state_abbr: string;
  facility_count: number;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  let facilities: FacilityCardData[] = [];
  let cities: CityResult[] = [];
  let nearbyLabel = "";

  if (query.length > 0) {
    const db = getDb();
    const isZip = /^\d{5}$/.test(query);

    if (isZip) {
      // Try our own data first
      const zipFacility = await db
        .prepare(
          `SELECT lat, lng, city, state_abbr FROM facilities
           WHERE zip = ?1 AND lat IS NOT NULL AND lng IS NOT NULL AND ${VISIBLE}
           LIMIT 1`
        )
        .bind(query)
        .first<{ lat: number; lng: number; city: string; state_abbr: string }>();

      if (zipFacility) {
        nearbyLabel = `${zipFacility.city}, ${zipFacility.state_abbr}`;
        facilities = await getNearbyFacilities(zipFacility.lat, zipFacility.lng, 25, 20);
      } else {
        // Fallback: Zippopotam.us (free, no API key)
        try {
          const geoRes = await fetch(
            `https://api.zippopotam.us/us/${query}`,
            { next: { revalidate: 86400 } }
          );
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            const place = geoData?.places?.[0];
            if (place?.latitude && place?.longitude) {
              const lat = parseFloat(place.latitude);
              const lng = parseFloat(place.longitude);
              nearbyLabel = `${place["place name"]}, ${place["state abbreviation"]}`;
              facilities = await getNearbyFacilities(lat, lng, 25, 20);
            }
          }
        } catch {
          // Geocoding failed — fall through to no results
        }
      }
    } else {
      const [facilitiesResult, citiesResult] = await Promise.all([
        db
          .prepare(
            `SELECT ${CARD_FIELDS} FROM facilities
             WHERE ${VISIBLE}
               AND (name LIKE '%'||?1||'%' OR city LIKE '%'||?1||'%')
             ORDER BY google_review_count DESC
             LIMIT 20`
          )
          .bind(query)
          .all<CardRow>(),

        db
          .prepare(
            `SELECT c.id, c.name, c.slug, s.slug AS state_slug, s.abbr AS state_abbr,
               count(*) AS facility_count
             FROM facilities f
             JOIN cities c ON c.id = f.city_id
             JOIN states s ON s.id = f.state_id
             WHERE c.name LIKE '%'||?1||'%' AND ${VISIBLE}
             GROUP BY c.id, s.id
             ORDER BY facility_count DESC
             LIMIT 10`
          )
          .bind(query)
          .all<CityResult>(),
      ]);

      facilities = facilitiesResult.results.map((row) => ({
        ...row,
        secondary_types: parseJson<string[]>(row.secondary_types, []),
      }));
      cities = citiesResult.results;
    }
  }

  const hasResults = facilities.length > 0 || cities.length > 0;

  return (
    <section className="px-4 py-12">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Search results" },
            ]}
          />
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-2">
          {nearbyLabel
            ? `Facilities near ${nearbyLabel}`
            : query
              ? `Results for "${query}"`
              : "Search"}
        </h1>

        {query && !hasResults && (
          <div className="mt-8 text-center py-16">
            <p className="text-text-mid text-lg mb-2">
              No results found for &ldquo;{query}&rdquo;
            </p>
            <p className="text-text-light text-sm mb-6">
              Try searching for a city, ZIP code, or facility name.
            </p>
            <Link
              href="/"
              className="inline-block bg-accent text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-accent-light transition-colors"
            >
              Back to home
            </Link>
          </div>
        )}

        {!query && (
          <p className="text-text-mid text-lg mt-4">
            Enter a city, ZIP code, or facility name to find places to dump near you.
          </p>
        )}

        {/* City matches */}
        {cities.length > 0 && (
          <div className="mt-8 mb-10">
            <h2 className="font-serif text-xl font-bold text-primary mb-4">
              Cities
            </h2>
            <div className="flex flex-wrap gap-3">
              {cities.map((city) => (
                <Link
                  key={city.id}
                  href={`/${city.state_slug}/${city.slug}`}
                  className="bg-card border border-border rounded-xl px-5 py-3 hover:border-accent hover:shadow-sm transition-all group"
                >
                  <span className="font-serif font-bold text-primary group-hover:text-accent transition-colors">
                    {city.name}, {city.state_abbr}
                  </span>
                  {city.facility_count > 0 && (
                    <span className="block text-xs text-text-mid mt-0.5">
                      {city.facility_count} facilit{city.facility_count !== 1 ? "ies" : "y"}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Facility results */}
        {facilities.length > 0 && (
          <div className="mt-8">
            <h2 className="font-serif text-xl font-bold text-primary mb-4">
              Facilities
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {facilities.map((facility) => (
                <FacilityCard key={facility.id} facility={facility} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
