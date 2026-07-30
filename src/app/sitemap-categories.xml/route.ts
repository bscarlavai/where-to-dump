import { getDb } from "@/lib/db";
import { buildSitemapXml, SITEMAP_HEADERS, BASE_URL } from "@/lib/sitemap";
import { CATEGORY_SLUG_MAP, ACCEPTS_SLUG_MAP } from "@/lib/constants/facility-types";
import { VISIBLE } from "@/lib/queries/facilities";

export const revalidate = 86400; // Cache for 24 hours

export async function GET() {
  const [{ results: states }, { results: acceptsStates }] = await Promise.all([
    getDb()
      .prepare(`SELECT DISTINCT state_slug FROM facilities WHERE ${VISIBLE} ORDER BY state_slug`)
      .all<{ state_slug: string }>(),
    // accepts pages only exist where scraped materials data exists
    getDb()
      .prepare(
        `SELECT DISTINCT state_slug, value AS material
         FROM facilities, json_each(accepted_materials)
         WHERE ${VISIBLE}`
      )
      .all<{ state_slug: string; material: string }>(),
  ]);

  const materialsByState = new Map<string, Set<string>>();
  for (const row of acceptsStates) {
    if (!materialsByState.has(row.state_slug)) materialsByState.set(row.state_slug, new Set());
    materialsByState.get(row.state_slug)!.add(row.material);
  }

  const urls = [
    // one URL per state × category
    ...states.flatMap((s) =>
      Object.keys(CATEGORY_SLUG_MAP).map((categorySlug) => ({
        loc: `${BASE_URL}/${s.state_slug}/category/${categorySlug}/`,
        changefreq: "monthly",
        priority: "0.6",
      }))
    ),
    // one URL per state × accepts material with data
    ...states.flatMap((s) =>
      Object.entries(ACCEPTS_SLUG_MAP)
        .filter(([, material]) => materialsByState.get(s.state_slug)?.has(material))
        .map(([slug]) => ({
          loc: `${BASE_URL}/${s.state_slug}/accepts/${slug}/`,
          changefreq: "monthly",
          priority: "0.6",
        }))
    ),
  ];

  return new Response(buildSitemapXml(urls), {
    headers: SITEMAP_HEADERS,
  });
}
