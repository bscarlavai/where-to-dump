import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumb';
import { getGuideBySlug, getAllGuideSlugs } from '@/lib/guides';
import { canonicalUrl, siteUrl } from '@/app/seo';

export const dynamic = 'force-static';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllGuideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) return {};

  return {
    title: guide.frontmatter.title,
    description: guide.frontmatter.description,
    alternates: {
      canonical: canonicalUrl(`/guides/${slug}`),
    },
    openGraph: {
      title: guide.frontmatter.title,
      description: guide.frontmatter.description,
      type: 'article',
      publishedTime: guide.frontmatter.publishedAt,
      ...(guide.frontmatter.updatedAt && { modifiedTime: guide.frontmatter.updatedAt }),
    },
  };
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.frontmatter.title,
    description: guide.frontmatter.description,
    datePublished: guide.frontmatter.publishedAt,
    ...(guide.frontmatter.updatedAt && { dateModified: guide.frontmatter.updatedAt }),
    publisher: {
      '@type': 'Organization',
      name: 'Where To Dump',
      url: siteUrl(),
    },
  };

  return (
    <section className="px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Guides', href: '/guides/' },
            { label: guide.frontmatter.title },
          ]}
        />

        <article className="mt-6">
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-3">
            {guide.frontmatter.title}
          </h1>
          <p className="text-[15px] leading-relaxed mb-8 text-text-mid">
            {guide.frontmatter.description}
          </p>

          {guide.content.includes('<AffiliateLink') && (
            <p className="text-xs mb-8 px-4 py-2.5 rounded-lg bg-accent-pale text-text-mid border border-border">
              Some links in this guide are affiliate links. If you purchase through them, we may earn a small commission at no extra cost to you. This helps support GoFarmHop.
            </p>
          )}

          <div
            className="prose prose-lg max-w-none text-text"
            dangerouslySetInnerHTML={{ __html: guide.html }}
          />
        </article>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </div>
    </section>
  );
}
