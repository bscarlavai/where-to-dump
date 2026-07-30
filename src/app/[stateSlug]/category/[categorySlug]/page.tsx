import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FacilityCard } from "@/components/FacilityCard";
import Breadcrumb from "@/components/Breadcrumb";
import { CATEGORY_SLUG_MAP, CATEGORY_SEO_LABELS } from "@/lib/constants/facility-types";
import { getCitiesByState } from "@/lib/queries/cities";
import { getFacilitiesByStateAndType } from "@/lib/queries/facilities";
import { getStateBySlug } from "@/lib/queries/states";
import { canonicalUrl } from "@/app/seo";

type Props = {
  params: Promise<{ stateSlug: string; categorySlug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stateSlug, categorySlug } = await params;
  const facilityType = CATEGORY_SLUG_MAP[categorySlug];
  if (!facilityType) return { title: "Not Found" };

  const state = await getStateBySlug(stateSlug);
  if (!state) return { title: "State Not Found" };

  const label = CATEGORY_SEO_LABELS[categorySlug];
  return {
    title: `${label} in ${state.name}`,
    description: `Find ${label.toLowerCase()} in ${state.name}. Browse locations by city with hours, ratings, and directions.`,
    alternates: { canonical: canonicalUrl(`/${stateSlug}/category/${categorySlug}`) },
  };
}

export default async function StateCategoryPage({ params }: Props) {
  const { stateSlug, categorySlug } = await params;
  const facilityType = CATEGORY_SLUG_MAP[categorySlug];
  if (!facilityType) notFound();

  const state = await getStateBySlug(stateSlug);
  if (!state) notFound();

  const [facilities, cities] = await Promise.all([
    getFacilitiesByStateAndType(stateSlug, facilityType),
    getCitiesByState(stateSlug),
  ]);

  const label = CATEGORY_SEO_LABELS[categorySlug];

  // Cities that have facilities in this category
  const citiesWithCategory = cities.filter((city) =>
    facilities.some((f) => f.city_slug === city.slug)
  );

  const topFacility = facilities[0]; // Already sorted by review count

  // FAQ — plain text for JSON-LD, JSX for rendered display
  const faqItems = [
    {
      q: `How many ${label.toLowerCase()} are in ${state.name}?`,
      text: `There are ${facilities.length} ${label.toLowerCase()} listed in ${state.name} across ${citiesWithCategory.length} cities.`,
      jsx: <>There are {facilities.length} {label.toLowerCase()} listed in <Link href={`/${stateSlug}`} className="text-accent font-semibold hover:underline">{state.name}</Link> across {citiesWithCategory.length}{" "}cities.</>,
    },
    {
      q: `What does it cost to use ${label.toLowerCase()} in ${state.name}?`,
      text: `Fees vary by facility and load type. Many charge per load or per ton, some drop-off services are free, and county-run sites are often cheaper or free for local residents. Call the facility to confirm current rates before you go.`,
      jsx: <>Fees vary by facility and load type. Many charge per load or per ton, some drop-off services are free, and county-run sites are often cheaper or free for local residents. Call the facility to confirm current rates before you go.</>,
    },
    {
      q: `Where are the best-rated ${label.toLowerCase()} in ${state.name}?`,
      text: topFacility
        ? `The most-reviewed is ${topFacility.name} in ${topFacility.city}${topFacility.google_rating ? ` with a ${topFacility.google_rating}-star rating from ${topFacility.google_review_count?.toLocaleString()} Google reviews` : ""}.`
        : `Browse our listings to find the best ${label.toLowerCase()} in ${state.name}.`,
      jsx: topFacility
        ? <>The most-reviewed is <Link href={`/${topFacility.state_slug}/${topFacility.city_slug}/${topFacility.slug}`} className="text-accent font-semibold hover:underline">{topFacility.name}</Link> in <Link href={`/${stateSlug}/${topFacility.city_slug}`} className="text-accent font-semibold hover:underline">{topFacility.city}</Link>{topFacility.google_rating ? <> with a {topFacility.google_rating}-star rating from {topFacility.google_review_count?.toLocaleString()} Google reviews</> : null}.</>
        : <>Browse our listings to find the best {label.toLowerCase()} in <Link href={`/${stateSlug}`} className="text-accent font-semibold hover:underline">{state.name}</Link>.</>,
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
                { label: state.name, href: `/${stateSlug}` },
                { label },
              ]}
            />
          </div>

          {/* Hero */}
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-2">
            {label} in {state.name}
          </h1>
          <p className="text-text-mid text-lg mb-8">
            {facilities.length} {facilities.length === 1 ? "location" : "locations"} across {citiesWithCategory.length} {citiesWithCategory.length === 1 ? "city" : "cities"} in {state.name}.
          </p>

          {/* Facility cards */}
          {facilities.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
              {facilities.map((facility) => (
                <FacilityCard key={facility.slug} facility={facility} />
              ))}
            </div>
          ) : (
            <div className="bg-accent-pale border border-accent/15 rounded-xl px-5 py-3.5 mb-10">
              <p className="text-sm text-text">
                No {label.toLowerCase()} listed in {state.name} yet.{" "}
                <Link href={`/${stateSlug}`} className="text-accent font-semibold hover:underline">
                  Browse all facilities in {state.name}
                </Link>
              </p>
            </div>
          )}

          {/* SEO Content */}
          {facilities.length > 0 && (
            <div className="mb-12 max-w-3xl">
              <h2 className="font-serif text-2xl font-bold text-primary mb-4">
                About {label} in {state.name}
              </h2>
              <div className="space-y-4 text-text-mid leading-relaxed">
                <p>
                  {state.name} has {facilities.length} listed {label.toLowerCase()} spread across{" "}
                  {citiesWithCategory.length} {citiesWithCategory.length === 1 ? "city" : "cities"}. Check each
                  listing for hours, contact info, and ratings, then call ahead. Fees and
                  accepted materials vary from site to site, and some facilities only serve
                  local residents.
                </p>
                {topFacility && (
                  <p>
                    The most-reviewed is{" "}
                    <Link
                      href={`/${topFacility.state_slug}/${topFacility.city_slug}/${topFacility.slug}`}
                      className="text-accent font-semibold hover:underline"
                    >
                      {topFacility.name}
                    </Link>{" "}
                    in <Link href={`/${stateSlug}/${topFacility.city_slug}`} className="text-accent font-semibold hover:underline">{topFacility.city}</Link>, with {topFacility.google_review_count?.toLocaleString()} Google reviews.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Browse by City */}
          {citiesWithCategory.length > 0 && (
            <div className="mb-12 bg-primary-pale rounded-2xl p-6 sm:p-8">
              <h2 className="font-serif text-2xl font-bold text-primary mb-4">
                {label} by City
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {citiesWithCategory.map((city) => {
                  const count = facilities.filter((f) => f.city_slug === city.slug).length;
                  return (
                    <Link
                      key={city.slug}
                      href={`/near/${city.slug}/${categorySlug}`}
                      className="bg-white border border-border rounded-lg px-4 py-3 hover:shadow-sm transition-shadow"
                    >
                      <span className="font-semibold text-primary text-sm">{city.name}</span>
                      <span className="text-text-light text-xs ml-1">
                        {count} facilit{count !== 1 ? "ies" : "y"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* FAQ */}
          <div className="mb-12">
            <h2 className="font-serif text-2xl font-bold text-primary mb-4">
              Frequently Asked Questions
            </h2>
            <div className="space-y-3">
              {faqItems.map((item) => (
                <div key={item.q} className="border border-border rounded-xl p-5">
                  <h3 className="font-semibold text-primary mb-1.5">{item.q}</h3>
                  <p className="text-text-mid text-sm leading-relaxed">{item.jsx}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Back to state */}
          <Link
            href={`/${stateSlug}`}
            className="text-accent font-semibold hover:underline"
          >
            Browse all facilities in {state.name} &rarr;
          </Link>
        </div>
      </section>
    </>
  );
}
