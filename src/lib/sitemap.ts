type SitemapUrl = {
  loc: string;
  lastmod?: string;
  changefreq: string;
  priority: string;
};

export function buildSitemapXml(urls: SitemapUrl[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;
}

export function buildSitemapIndexXml(
  sitemaps: { loc: string; lastmod?: string }[]
) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps
  .map(
    (s) => `  <sitemap>
    <loc>${s.loc}</loc>
    ${s.lastmod ? `<lastmod>${s.lastmod}</lastmod>` : ""}
  </sitemap>`
  )
  .join("\n")}
</sitemapindex>`;
}

export const SITEMAP_HEADERS = {
  "Content-Type": "application/xml",
  "Cache-Control":
    "public, max-age=86400, s-maxage=86400, stale-while-revalidate=43200",
};

export const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://wheretodump.com";
