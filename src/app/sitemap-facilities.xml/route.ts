import { getDb } from "@/lib/db";
import { buildSitemapXml, SITEMAP_HEADERS, BASE_URL } from "@/lib/sitemap";

// Same visibility clause as src/lib/queries/facilities.ts (module-private there).
const VISIBLE = `status IN ('imported','approved') AND service_only = 0
  AND (google_business_status IS NULL OR google_business_status != 'CLOSED_PERMANENTLY')`;

const MAX_URLS_PER_SITEMAP = 50000;

export const revalidate = 86400; // Cache for 24 hours

interface FacilityRow {
  slug: string;
  city_slug: string;
  state_slug: string;
  updated_at: string | null;
}

export async function GET() {
  const db = getDb();

  // Fetch in batches of 1000 to avoid memory issues with large datasets
  const allFacilities: FacilityRow[] = [];
  let offset = 0;
  const batchSize = 1000;

  while (allFacilities.length < MAX_URLS_PER_SITEMAP) {
    const { results } = await db
      .prepare(
        `SELECT slug, city_slug, state_slug, updated_at FROM facilities
         WHERE ${VISIBLE}
         ORDER BY state_slug, city_slug, slug
         LIMIT ?1 OFFSET ?2`
      )
      .bind(batchSize, offset)
      .all<FacilityRow>();

    if (results.length === 0) break;
    allFacilities.push(...results);
    if (results.length < batchSize) break;
    offset += batchSize;
  }

  // Cap at sitemap limit
  const facilities = allFacilities.slice(0, MAX_URLS_PER_SITEMAP);

  const urls = facilities.map((f) => ({
    loc: `${BASE_URL}/${f.state_slug}/${f.city_slug}/${f.slug}/`,
    lastmod: f.updated_at?.split(/[T ]/)[0],
    changefreq: "weekly",
    priority: "0.6",
  }));

  return new Response(buildSitemapXml(urls), {
    headers: SITEMAP_HEADERS,
  });
}
