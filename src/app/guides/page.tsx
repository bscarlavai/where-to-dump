import type { Metadata } from 'next';
import Link from 'next/link';
import Breadcrumb from '@/components/Breadcrumb';
import { getAllGuides } from '@/lib/guides';
import { canonicalUrl } from '@/app/seo';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Waste Disposal Guides',
  description:
    'Straight answers on getting rid of stuff: dump fees, what landfills accept, mattress and e-waste disposal, and RV dump station basics.',
  alternates: {
    canonical: canonicalUrl('/guides'),
  },
};

export default function GuidesIndexPage() {
  const guides = getAllGuides();

  return (
    <section className="px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Guides' },
          ]}
        />

        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mt-6 mb-2">
          Guides
        </h1>
        <p className="text-[15px] leading-relaxed mb-8 text-text-mid">
          What things cost at the dump, what facilities will and won&apos;t take, and how to get rid of the awkward stuff.
        </p>

        <div className="space-y-4">
          {guides.map((guide) => (
            <Link
              key={guide.slug}
              href={`/guides/${guide.slug}/`}
              className="block p-6 bg-card rounded-xl border border-border transition-shadow hover:shadow-md"
            >
              <h2 className="font-serif text-lg font-bold text-primary mb-1">
                {guide.frontmatter.title}
              </h2>
              <p className="text-[14px] leading-relaxed text-text-mid">
                {guide.frontmatter.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
