import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStateBySlug } from "@/lib/queries/states";
import { getFacilitiesByMaterial } from "@/lib/queries/facilities";
import { FacilityCard } from "@/components/FacilityCard";
import Breadcrumb from "@/components/Breadcrumb";
import { ACCEPTS_SLUG_MAP, ACCEPTS_SEO_LABELS, MATERIAL_LABELS } from "@/lib/constants/facility-types";
import { canonicalUrl } from "@/app/seo";

export const revalidate = 3600;

type Props = {
  params: Promise<{ stateSlug: string; materialSlug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stateSlug, materialSlug } = await params;
  const material = ACCEPTS_SLUG_MAP[materialSlug];
  const state = await getStateBySlug(stateSlug);
  if (!material || !state) return { title: "Not Found" };
  const label = ACCEPTS_SEO_LABELS[materialSlug];
  return {
    title: `${label} in ${state.name}`,
    description: `Facilities in ${state.name} that accept ${MATERIAL_LABELS[material].toLowerCase()}: locations, hours, ratings, and fees where published. Call ahead to confirm.`,
    alternates: { canonical: canonicalUrl(`/${stateSlug}/accepts/${materialSlug}`) },
  };
}

export default async function AcceptsPage({ params }: Props) {
  const { stateSlug, materialSlug } = await params;
  const material = ACCEPTS_SLUG_MAP[materialSlug];
  if (!material) notFound();

  const [state, facilities] = await Promise.all([
    getStateBySlug(stateSlug),
    getFacilitiesByMaterial(stateSlug, material),
  ]);
  if (!state || facilities.length === 0) notFound();

  const label = ACCEPTS_SEO_LABELS[materialSlug];
  const materialLabel = MATERIAL_LABELS[material].toLowerCase();

  const faqItems = [
    {
      q: `Where can I take ${materialLabel} in ${state.name}?`,
      text: `Where To Dump lists ${facilities.length} facilities in ${state.name} that accept ${materialLabel}, based on each facility's published information. Availability and fees change, so call before you haul.`,
    },
    {
      q: `Does it cost money to drop off ${materialLabel}?`,
      text: `Often, yes. Many facilities charge per item or by weight for ${materialLabel}, and some take them free for local residents. Fees are listed on facility pages here where the facility publishes them.`,
    },
  ];

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.text },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <section className="px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <Breadcrumb
              items={[
                { label: "Home", href: "/" },
                { label: "States", href: "/states" },
                { label: state.name, href: `/${stateSlug}` },
                { label: label },
              ]}
            />
          </div>

          <div className="mb-10">
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-2">
              {label} in {state.name}
            </h1>
            <p className="text-text-mid text-lg max-w-2xl">
              {facilities.length} facilit{facilities.length !== 1 ? "ies" : "y"} listed as accepting {materialLabel}, per each facility&apos;s published info. Fees vary and rules change, so call before you load up.
            </p>
          </div>

          <div className="mb-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {facilities.map((facility) => (
              <FacilityCard key={facility.id} facility={facility} />
            ))}
          </div>

          {/* FAQ */}
          <div className="mb-12 max-w-3xl">
            <h2 className="font-serif text-2xl font-bold text-primary mb-4">
              Frequently Asked Questions
            </h2>
            <div className="space-y-3">
              {faqItems.map((item) => (
                <div key={item.q} className="border border-border rounded-xl p-5">
                  <h3 className="font-semibold text-primary mb-1.5">{item.q}</h3>
                  <p className="text-text-mid text-sm leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-text-mid">
            Looking for something else?{" "}
            <Link href={`/${stateSlug}`} className="text-accent font-semibold hover:underline">
              Browse all {state.name} facilities
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
