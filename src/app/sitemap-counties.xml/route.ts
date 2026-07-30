import { getDb } from "@/lib/db";
import { buildSitemapXml, SITEMAP_HEADERS, BASE_URL } from "@/lib/sitemap";

// Same visibility clause as src/lib/queries/facilities.ts (module-private there).
const VISIBLE = `status IN ('imported','approved') AND service_only = 0
  AND (google_business_status IS NULL OR google_business_status != 'CLOSED_PERMANENTLY')`;

export const revalidate = 86400;

export async function GET() {
  // Counties with at least one visible facility
  const { results: counties } = await getDb()
    .prepare(
      `SELECT DISTINCT f.state_slug, co.slug AS county_slug
       FROM facilities f
       JOIN counties co ON co.id = f.county_id
       WHERE ${VISIBLE}
       ORDER BY f.state_slug, co.slug`
    )
    .all<{ state_slug: string; county_slug: string }>();

  const urls = counties.map((c) => ({
    loc: `${BASE_URL}/${c.state_slug}/county/${c.county_slug}/`,
    changefreq: "monthly",
    priority: "0.6",
  }));

  return new Response(buildSitemapXml(urls), {
    headers: SITEMAP_HEADERS,
  });
}
