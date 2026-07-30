import { getDb } from "@/lib/db";
import { buildSitemapXml, SITEMAP_HEADERS, BASE_URL } from "@/lib/sitemap";
import { CATEGORY_SLUG_MAP } from "@/lib/constants/facility-types";

// Same visibility clause as src/lib/queries/facilities.ts (module-private there).
const VISIBLE = `status IN ('imported','approved') AND service_only = 0
  AND (google_business_status IS NULL OR google_business_status != 'CLOSED_PERMANENTLY')`;

export const revalidate = 86400; // Cache for 24 hours

export async function GET() {
  const { results: states } = await getDb()
    .prepare(
      `SELECT DISTINCT state_slug FROM facilities WHERE ${VISIBLE} ORDER BY state_slug`
    )
    .all<{ state_slug: string }>();

  // Generate one URL per state × category combination
  const urls = states.flatMap((s) =>
    Object.keys(CATEGORY_SLUG_MAP).map((categorySlug) => ({
      loc: `${BASE_URL}/${s.state_slug}/category/${categorySlug}/`,
      changefreq: "monthly",
      priority: "0.6",
    }))
  );

  return new Response(buildSitemapXml(urls), {
    headers: SITEMAP_HEADERS,
  });
}
