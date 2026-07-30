import { getAllGuides } from '@/lib/guides';
import { buildSitemapXml, SITEMAP_HEADERS, BASE_URL } from '@/lib/sitemap';

export const dynamic = 'force-static';

export async function GET() {
  const guides = getAllGuides();

  const urls = [
    { loc: `${BASE_URL}/guides`, priority: '0.7', changefreq: 'weekly' },
    ...guides.map((guide) => ({
      loc: `${BASE_URL}/guides/${guide.slug}`,
      priority: '0.6',
      changefreq: 'monthly',
      lastmod: guide.frontmatter.updatedAt || guide.frontmatter.publishedAt,
    })),
  ];

  return new Response(buildSitemapXml(urls), { headers: SITEMAP_HEADERS });
}
