import { getAllStates } from "@/lib/queries/states";
import { buildSitemapXml, SITEMAP_HEADERS, BASE_URL } from "@/lib/sitemap";

export const revalidate = 86400; // Cache for 24 hours

export async function GET() {
  // Only states with at least one visible facility
  const states = await getAllStates();

  const urls = states.map((s) => ({
    loc: `${BASE_URL}/${s.slug}`,
    changefreq: "monthly",
    priority: "0.8",
  }));

  return new Response(buildSitemapXml(urls), {
    headers: SITEMAP_HEADERS,
  });
}
