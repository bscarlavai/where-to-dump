import { getDb } from "@/lib/db";
import { buildSitemapXml, SITEMAP_HEADERS, BASE_URL } from "@/lib/sitemap";

// Same visibility clause as src/lib/queries/facilities.ts (module-private there).
const VISIBLE = `status IN ('imported','approved') AND service_only = 0
  AND (google_business_status IS NULL OR google_business_status != 'CLOSED_PERMANENTLY')`;

export const revalidate = 86400; // 24 hours

export async function GET() {
  // Cities with visible facilities, busiest first
  const { results: cities } = await getDb()
    .prepare(
      `SELECT city_slug, count(*) AS facility_count FROM facilities
       WHERE ${VISIBLE}
       GROUP BY city_slug
       ORDER BY facility_count DESC`
    )
    .all<{ city_slug: string; facility_count: number }>();

  // Main near pages only: /near/[citySlug]. The per-category near sub-pages
  // still carry the farm-vertical activity slugs; add them back once the
  // /near/[citySlug]/[categorySlug] pages are ported to the waste taxonomy.
  const urls = cities.map((city) => ({
    loc: `${BASE_URL}/near/${city.city_slug}`,
    changefreq: "weekly",
    priority: "0.6",
  }));

  return new Response(buildSitemapXml(urls), { headers: SITEMAP_HEADERS });
}
