import { getDb } from "@/lib/db";
import { buildSitemapXml, SITEMAP_HEADERS, BASE_URL } from "@/lib/sitemap";

// Same visibility clause as src/lib/queries/facilities.ts (module-private there).
const VISIBLE = `status IN ('imported','approved') AND service_only = 0
  AND (google_business_status IS NULL OR google_business_status != 'CLOSED_PERMANENTLY')`;

export const revalidate = 86400; // Cache for 24 hours

export async function GET() {
  // City pages exist wherever a visible facility does — derive from facilities
  const { results: cities } = await getDb()
    .prepare(
      `SELECT DISTINCT state_slug, city_slug FROM facilities
       WHERE ${VISIBLE}
       ORDER BY state_slug, city_slug`
    )
    .all<{ state_slug: string; city_slug: string }>();

  const urls = cities.map((c) => ({
    loc: `${BASE_URL}/${c.state_slug}/${c.city_slug}`,
    changefreq: "monthly",
    priority: "0.7",
  }));

  return new Response(buildSitemapXml(urls), {
    headers: SITEMAP_HEADERS,
  });
}
