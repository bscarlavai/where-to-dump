import { buildSitemapIndexXml, SITEMAP_HEADERS, BASE_URL } from "@/lib/sitemap";

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  const sitemaps = [
    { loc: `${BASE_URL}/sitemap-pages.xml`, lastmod: today },
    { loc: `${BASE_URL}/sitemap-states.xml`, lastmod: today },
    { loc: `${BASE_URL}/sitemap-cities.xml`, lastmod: today },
    { loc: `${BASE_URL}/sitemap-counties.xml`, lastmod: today },
    { loc: `${BASE_URL}/sitemap-facilities.xml`, lastmod: today },
    { loc: `${BASE_URL}/sitemap-near.xml`, lastmod: today },
    { loc: `${BASE_URL}/sitemap-categories.xml`, lastmod: today },
    { loc: `${BASE_URL}/sitemap-guides.xml`, lastmod: today },
  ];

  return new Response(buildSitemapIndexXml(sitemaps), {
    headers: SITEMAP_HEADERS,
  });
}
