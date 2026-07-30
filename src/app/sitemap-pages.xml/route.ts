import { buildSitemapXml, SITEMAP_HEADERS, BASE_URL } from "@/lib/sitemap";

export async function GET() {
  const urls = [
    { loc: `${BASE_URL}/`, priority: "1.0", changefreq: "weekly" },
    { loc: `${BASE_URL}/about/`, priority: "0.5", changefreq: "monthly" },
    { loc: `${BASE_URL}/states/`, priority: "0.8", changefreq: "monthly" },
    { loc: `${BASE_URL}/near-me/`, priority: "0.7", changefreq: "monthly" },
    { loc: `${BASE_URL}/submit/`, priority: "0.5", changefreq: "monthly" },
  ];

  return new Response(buildSitemapXml(urls), {
    headers: SITEMAP_HEADERS,
  });
}
