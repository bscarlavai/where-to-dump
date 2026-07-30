import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStateBySlug } from "@/lib/queries/states";
import { getCityBySlug, getNearbyCities } from "@/lib/queries/cities";
import { getFacilitiesByCity } from "@/lib/queries/facilities";
import { FacilityListWithFilter } from "@/components/FacilityListWithFilter";
import Breadcrumb from "@/components/Breadcrumb";
import { CATEGORY_SLUG_MAP, CATEGORY_SEO_LABELS } from "@/lib/constants/facility-types";
import { canonicalUrl } from "@/app/seo";

type Props = {
  params: Promise<{ stateSlug: string; citySlug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stateSlug, citySlug } = await params;
  const [state, city] = await Promise.all([
    getStateBySlug(stateSlug),
    getCityBySlug(stateSlug, citySlug),
  ]);
  if (!state || !city) {
    return { title: "City Not Found" };
  }
  return {
    title: `Landfills & Waste Disposal in ${city.name}, ${state.abbreviation}`,
    description: `Find landfills, transfer stations, recycling centers, and e-waste drop-off near ${city.name}, ${state.name}, with hours, ratings, and directions.`,
    alternates: { canonical: canonicalUrl(`/${stateSlug}/${citySlug}`) },
  };
}

export default async function CityPage({ params }: Props) {
  const { stateSlug, citySlug } = await params;

  const [state, city] = await Promise.all([
    getStateBySlug(stateSlug),
    getCityBySlug(stateSlug, citySlug),
  ]);

  if (!state || !city) notFound();

  const [facilities, nearbyCities] = await Promise.all([
    getFacilitiesByCity(stateSlug, citySlug),
    getNearbyCities(stateSlug, citySlug),
  ]);

  // Category counts (primary or secondary type)
  const catCounts: Record<string, number> = {};
  for (const [slug, type] of Object.entries(CATEGORY_SLUG_MAP)) {
    const n = facilities.filter(
      (f) => f.facility_type === type || f.secondary_types.includes(type)
    ).length;
    if (n > 0) catCounts[slug] = n;
  }
  const activeCategories = Object.keys(CATEGORY_SLUG_MAP).filter((slug) => catCounts[slug]);

  // Top rated facility for SEO content
  const topFacility = [...facilities].sort(
    (a, b) => (b.google_rating ?? 0) - (a.google_rating ?? 0)
  )[0];

  // FAQ — plain text for JSON-LD, JSX for rendered display with links
  const faqItems = [
    {
      q: `Where can I dump trash in ${city.name}, ${state.name}?`,
      text: `There ${facilities.length === 1 ? "is" : "are"} ${facilities.length} waste disposal facilit${facilities.length !== 1 ? "ies" : "y"} listed in ${city.name}, ${state.abbreviation}, including ${activeCategories.slice(0, 3).map((s) => CATEGORY_SEO_LABELS[s].toLowerCase()).join(", ")}${activeCategories.length > 3 ? ", and more" : ""}.`,
      jsx: <>There {facilities.length === 1 ? "is" : "are"} {facilities.length} waste disposal facilit{facilities.length !== 1 ? "ies" : "y"} listed in {city.name}, <Link href={`/${stateSlug}`} className="text-accent font-semibold hover:underline">{state.abbreviation}</Link>, including{" "}
        {activeCategories.slice(0, 3).map((slug, i) => (
          <span key={slug}>{i > 0 && ", "}<Link href={`/near/${citySlug}/${slug}`} className="text-accent font-semibold hover:underline">{CATEGORY_SEO_LABELS[slug].toLowerCase()}</Link></span>
        ))}{activeCategories.length > 3 ? ", and more" : ""}.
      </>,
    },
    {
      q: `How much does it cost to dump in ${city.name}?`,
      text: `Fees depend on the facility and the load. Landfills and transfer stations typically charge per load or per ton, while recycling and e-waste drop-off is often free. Some sites are free for local residents. Call before you go to confirm current rates and payment methods.`,
      jsx: <>Fees depend on the facility and the load. Landfills and transfer stations typically charge per load or per ton, while recycling and e-waste drop-off is often free. Some sites are free for local residents. Call before you go to confirm current rates and payment methods.</>,
    },
    {
      q: `Are there other dump sites near ${city.name}?`,
      text: nearbyCities.length > 0
        ? `Yes. Nearby cities with facilities include ${nearbyCities.slice(0, 3).map((c) => `${c.name} (${c.facility_count} facilit${c.facility_count !== 1 ? "ies" : "y"}, ${Math.round(c.distance_miles)} mi)`).join(", ")}.`
        : `Browse all facilities in ${state.name} to find more options nearby.`,
      jsx: nearbyCities.length > 0
        ? <>Yes. Nearby cities with facilities include{" "}
            {nearbyCities.slice(0, 3).map((c, i) => (
              <span key={c.slug}>{i > 0 && ", "}<Link href={`/${c.state_slug}/${c.slug}`} className="text-accent font-semibold hover:underline">{c.name}</Link> ({c.facility_count} facilit{c.facility_count !== 1 ? "ies" : "y"}, {Math.round(c.distance_miles)} mi)</span>
            ))}.
          </>
        : <>Browse all facilities in <Link href={`/${stateSlug}`} className="text-accent font-semibold hover:underline">{state.name}</Link> to find more options nearby.</>,
    },
  ];

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.text,
      },
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
                { label: city.name },
              ]}
            />
          </div>

          {/* Hero */}
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-2">
            Waste Disposal in {city.name}, {state.abbreviation}
          </h1>
          <p className="text-text-mid text-lg mb-8">
            {facilities.length} facilit{facilities.length !== 1 ? "ies" : "y"} near {city.name}: landfills, transfer stations, recycling centers, and more.
          </p>

          {/* Facility list with type filter */}
          {facilities.length === 0 ? (
            <div className="bg-accent-pale border border-accent/15 rounded-xl px-5 py-3.5 mb-10">
              <p className="text-sm text-text">
                No facilities listed in {city.name} yet.{" "}
                <Link href={`/${stateSlug}`} className="text-accent font-semibold hover:underline">
                  Browse all facilities in {state.name}
                </Link>
              </p>
            </div>
          ) : (
            <div className="mb-12">
              <FacilityListWithFilter facilities={facilities} />
            </div>
          )}

          {/* Browse by Category */}
          {activeCategories.length > 0 && (
            <div className="mb-12">
              <h2 className="font-serif text-2xl font-bold text-primary mb-4">
                Browse by Category
              </h2>
              <div className="flex flex-wrap gap-2">
                {activeCategories.map((slug) => (
                  <Link
                    key={slug}
                    href={`/near/${citySlug}/${slug}`}
                    className="tag-activity text-sm font-semibold px-3.5 py-1.5 rounded-full hover:opacity-80 transition-opacity"
                  >
                    {CATEGORY_SEO_LABELS[slug]}
                    <span className="ml-1 opacity-60">{catCounts[slug]}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* SEO Content */}
          {facilities.length > 0 && (
            <div className="mb-12 max-w-3xl">
              <h2 className="font-serif text-2xl font-bold text-primary mb-4">
                Dumping Trash in {city.name}
              </h2>
              <div className="space-y-4 text-text-mid leading-relaxed">
                <p>
                  {city.name},{" "}
                  <Link href={`/${stateSlug}`} className="text-accent font-semibold hover:underline">{state.abbreviation}</Link>{" "}
                  has {facilities.length} listed waste disposal facilit{facilities.length !== 1 ? "ies" : "y"}, covering{" "}
                  {activeCategories.slice(0, 4).map((slug, i) => (
                    <span key={slug}>{i > 0 && ", "}<Link href={`/near/${citySlug}/${slug}`} className="text-accent font-semibold hover:underline">{CATEGORY_SEO_LABELS[slug].toLowerCase()}</Link></span>
                  ))}
                  {activeCategories.length > 4 ? ", and more" : ""}.
                  Each listing includes hours, contact info, and Google ratings so you can pick a site before loading the truck.
                </p>
                {topFacility && (
                  <p>
                    The highest rated facility in {city.name} is{" "}
                    <Link
                      href={`/${topFacility.state_slug}/${topFacility.city_slug}/${topFacility.slug}`}
                      className="text-accent font-semibold hover:underline"
                    >
                      {topFacility.name}
                    </Link>
                    {topFacility.google_rating && (
                      <>, rated {topFacility.google_rating} stars from{" "}
                      {topFacility.google_review_count?.toLocaleString()} reviews</>
                    )}
                    . Call ahead to confirm fees, hours, and what the facility accepts.
                    Hazardous materials, tires, and appliances often have separate rules.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* FAQ */}
          {facilities.length > 0 && (
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
          )}

          {/* Navigation links */}
          <div className="mb-12 space-y-2">
            {city.county && city.county_slug && (
              <Link
                href={`/${stateSlug}/county/${city.county_slug}`}
                className="block text-accent font-semibold hover:underline"
              >
                All facilities in {city.county}, {state.abbreviation} &rarr;
              </Link>
            )}
            <Link
              href={`/${stateSlug}`}
              className="block text-accent font-semibold hover:underline"
            >
              Browse all facilities in {state.name} &rarr;
            </Link>
          </div>

          {/* Nearby Cities */}
          {nearbyCities.length > 0 && (
            <div>
              <h2 className="font-serif text-2xl font-bold text-primary mb-4">
                Nearby Cities
              </h2>
              <div className="flex flex-wrap gap-2">
                {nearbyCities.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/${c.state_slug}/${c.slug}`}
                    className="border border-border rounded-full px-4 py-2 hover:shadow-sm transition-shadow text-sm"
                  >
                    <span className="font-semibold text-primary">{c.name}</span>
                    <span className="text-text-light ml-1">
                      {c.facility_count} facilit{c.facility_count !== 1 ? "ies" : "y"}
                    </span>
                    <span className="text-text-light ml-1">
                      &middot; {Math.round(c.distance_miles)} mi
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
