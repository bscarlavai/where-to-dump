import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStateBySlug, getNearbyStates } from "@/lib/queries/states";
import { getFacilitiesByState, getTopRatedFacilitiesByState } from "@/lib/queries/facilities";
import { getCitiesByState } from "@/lib/queries/cities";
import { getCountiesByState } from "@/lib/queries/counties";
import { FacilityCard } from "@/components/FacilityCard";
import Breadcrumb from "@/components/Breadcrumb";
import { CATEGORY_SLUG_MAP, CATEGORY_SEO_LABELS, ACCEPTS_SLUG_MAP, ACCEPTS_SEO_LABELS } from "@/lib/constants/facility-types";
import { canonicalUrl } from "@/app/seo";
import type { FacilityCardData } from "@/types";

type Props = {
  params: Promise<{ stateSlug: string }>;
};

/** Count facilities per category slug (primary or secondary type). */
function categoryCounts(facilities: FacilityCardData[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [slug, type] of Object.entries(CATEGORY_SLUG_MAP)) {
    const n = facilities.filter(
      (f) => f.facility_type === type || f.secondary_types.includes(type)
    ).length;
    if (n > 0) counts[slug] = n;
  }
  return counts;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stateSlug } = await params;
  const state = await getStateBySlug(stateSlug);
  if (!state) {
    return { title: "State Not Found" };
  }
  return {
    title: `Landfills, Transfer Stations & Recycling Centers in ${state.name}`,
    description: `Find ${state.facility_count} waste disposal facilities in ${state.name}. Browse landfills, transfer stations, recycling centers, e-waste drop-off, and scrap yards with hours and ratings.`,
    alternates: { canonical: canonicalUrl(`/${stateSlug}`) },
  };
}

export default async function StatePage({ params }: Props) {
  const { stateSlug } = await params;
  const state = await getStateBySlug(stateSlug);

  if (!state) notFound();

  const [facilities, topRated, cities, nearbyStates, counties] = await Promise.all([
    getFacilitiesByState(stateSlug),
    getTopRatedFacilitiesByState(stateSlug),
    getCitiesByState(stateSlug),
    getNearbyStates(stateSlug),
    getCountiesByState(stateSlug),
  ]);

  const catCounts = categoryCounts(facilities);
  const activeCategories = Object.keys(CATEGORY_SLUG_MAP).filter((slug) => catCounts[slug]);
  const topFacility = topRated[0];

  // "Accepts X" pages only exist where scraped materials data backs them
  const acceptsCounts: Record<string, number> = {};
  for (const [slug, material] of Object.entries(ACCEPTS_SLUG_MAP)) {
    const n = facilities.filter((f) => (f.accepted_materials ?? []).includes(material)).length;
    if (n > 0) acceptsCounts[slug] = n;
  }
  const activeAccepts = Object.keys(ACCEPTS_SLUG_MAP).filter((slug) => acceptsCounts[slug]);

  const categoryLink = (slug: string, text: string) => (
    <Link href={`/${stateSlug}/category/${slug}`} className="text-accent font-semibold hover:underline">{text}</Link>
  );

  // FAQ — plain text for JSON-LD schema, JSX for rendered display
  const faqItems = [
    {
      q: `How many places can I dump trash in ${state.name}?`,
      text: `Where To Dump lists ${facilities.length} waste disposal facilities in ${state.name} across ${cities.length} cities, including landfills, transfer stations, recycling centers, and e-waste drop-off sites.`,
      jsx: <>Where To Dump lists {facilities.length} waste disposal facilities in {state.name} across {cities.length} cities, including{" "}
        {categoryLink("landfills", "landfills")},{" "}
        {categoryLink("transfer-stations", "transfer stations")},{" "}
        {categoryLink("recycling-centers", "recycling centers")}, and{" "}
        {categoryLink("e-waste", "e-waste drop-off sites")}.
      </>,
    },
    {
      q: `How much does it cost to dump at a landfill in ${state.name}?`,
      text: `Fees vary by facility. Most landfills and transfer stations in ${state.name} charge by the load or by the ton, and some county-run sites are free or discounted for local residents. Call ahead to confirm current rates and accepted payment methods before you load the truck.`,
      jsx: <>Fees vary by facility. Most landfills and transfer stations in {state.name} charge by the load or by the ton, and some county-run sites are free or discounted for local residents. Call ahead to confirm current rates and accepted payment methods before you load the truck.</>,
    },
    {
      q: `What do transfer stations in ${state.name} accept?`,
      text: `Most transfer stations accept household trash, bulky items, and yard waste. Many also take appliances, tires, and scrap metal, sometimes for an extra fee. Hazardous materials like paint, chemicals, and batteries usually require a dedicated household hazardous waste facility. Check each listing for what a specific site accepts.`,
      jsx: <>Most transfer stations accept household trash, bulky items, and yard waste. Many also take appliances, tires, and scrap metal, sometimes for an extra fee. Hazardous materials like paint, chemicals, and batteries usually require a dedicated{" "}
        {catCounts["hazardous-waste"] ? categoryLink("hazardous-waste", "household hazardous waste facility") : <>household hazardous waste facility</>}. Check each listing for what a specific site accepts.</>,
    },
    {
      q: `What is the best-rated waste facility in ${state.name}?`,
      text: topFacility
        ? `The top-rated facility in ${state.name} is ${topFacility.name} in ${topFacility.city} with a ${topFacility.google_rating} rating from ${topFacility.google_review_count?.toLocaleString()} Google reviews.`
        : `Browse our listings to find the highest rated facilities across ${state.name}.`,
      jsx: topFacility
        ? <>The top-rated facility in {state.name} is <Link href={`/${topFacility.state_slug}/${topFacility.city_slug}/${topFacility.slug}`} className="text-accent font-semibold hover:underline">{topFacility.name}</Link> in <Link href={`/${stateSlug}/${topFacility.city_slug}`} className="text-accent font-semibold hover:underline">{topFacility.city}</Link> with a {topFacility.google_rating} rating from {topFacility.google_review_count?.toLocaleString()} Google reviews.</>
        : <>Browse our listings to find the highest rated facilities across {state.name}.</>,
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
                { label: "States", href: "/states" },
                { label: state.name },
              ]}
            />
          </div>

          {/* Hero */}
          <div className="mb-10">
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-2">
              Waste Disposal in {state.name}
            </h1>
            <p className="text-text-mid text-lg max-w-2xl">
              {facilities.length} facilities across {cities.length} cities: landfills, transfer stations, recycling centers, and more.
            </p>
          </div>

          {/* Top Rated */}
          {topRated.length > 0 && (
            <div className="mb-12">
              <h2 className="font-serif text-2xl font-bold text-primary mb-4">
                Top Rated Facilities
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {topRated.map((facility) => (
                  <FacilityCard key={facility.slug} facility={facility} />
                ))}
              </div>
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
                    href={`/${stateSlug}/category/${slug}`}
                    className="tag-activity text-sm font-semibold px-3.5 py-1.5 rounded-full hover:opacity-80 transition-opacity"
                  >
                    {CATEGORY_SEO_LABELS[slug]}
                    <span className="ml-1 opacity-60">{catCounts[slug]}</span>
                  </Link>
                ))}
              </div>
              {activeAccepts.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {activeAccepts.map((slug) => (
                    <Link
                      key={slug}
                      href={`/${stateSlug}/accepts/${slug}`}
                      className="bg-primary text-white text-sm font-semibold uppercase tracking-[0.04em] px-3.5 py-1.5 rounded-full hover:opacity-80 transition-opacity"
                    >
                      {ACCEPTS_SEO_LABELS[slug]}
                      <span className="ml-1 opacity-60">{acceptsCounts[slug]}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SEO Content */}
          <div className="mb-12 max-w-3xl">
            <h2 className="font-serif text-2xl font-bold text-primary mb-4">
              Dumping Trash in {state.name}
            </h2>
            <div className="space-y-4 text-text-mid leading-relaxed">
              <p>
                {state.name} has {facilities.length} listed waste disposal facilities across{" "}
                {cities.length} cities. Got a truckload of junk? Head to a{" "}
                {categoryLink("landfills", "landfill")} or{" "}
                {categoryLink("transfer-stations", "transfer station")}. Sorting out
                recyclables, old electronics, or scrap? There are{" "}
                {categoryLink("recycling-centers", "recycling centers")},{" "}
                {categoryLink("e-waste", "e-waste drop-off sites")}, and{" "}
                {categoryLink("scrap-metal", "scrap yards")} that will take them. Scrap
                yards often pay you.
              </p>
              {topFacility && (
                <p>
                  The highest rated facility in {state.name} is{" "}
                  <Link
                    href={`/${topFacility.state_slug}/${topFacility.city_slug}/${topFacility.slug}`}
                    className="text-accent font-semibold hover:underline"
                  >
                    {topFacility.name}
                  </Link>{" "}
                  in{" "}
                  <Link href={`/${stateSlug}/${topFacility.city_slug}`} className="text-accent font-semibold hover:underline">
                    {topFacility.city}
                  </Link>, with a {topFacility.google_rating}-star rating from{" "}
                  {topFacility.google_review_count?.toLocaleString()} Google reviews.
                </p>
              )}
              <p>
                Before you go: call ahead. Fees, hours, and accepted materials change
                without much notice, and many county facilities restrict access to local
                residents or require proof of residency. Bring ID, expect to be weighed
                in and out at larger sites, and keep hazardous items like paint, chemicals,
                and batteries separate, since most regular landfills and transfer stations
                will turn them away.
              </p>
            </div>
          </div>

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

          {/* Browse by City */}
          {cities.length > 0 && (
            <div className="mb-12 bg-primary-pale rounded-2xl p-6 sm:p-8">
              <h2 className="font-serif text-2xl font-bold text-primary mb-4">
                Browse by City
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {cities.map((city) => (
                  <Link
                    key={city.slug}
                    href={`/${stateSlug}/${city.slug}`}
                    className="bg-white border border-border rounded-lg px-4 py-3 hover:shadow-sm transition-shadow"
                  >
                    <span className="font-semibold text-primary text-sm">{city.name}</span>
                    <span className="text-text-light text-xs ml-1">
                      {city.facility_count} facilit{city.facility_count !== 1 ? "ies" : "y"}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Browse by County */}
          {counties.length > 0 && (
            <div className="mb-12 bg-primary-pale rounded-2xl p-6 sm:p-8">
              <h2 className="font-serif text-2xl font-bold text-primary mb-4">
                Browse by County
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {counties.map((county) => (
                  <Link
                    key={county.county_slug}
                    href={`/${stateSlug}/county/${county.county_slug}`}
                    className="bg-white border border-border rounded-lg px-4 py-3 hover:shadow-sm transition-shadow"
                  >
                    <span className="font-semibold text-primary text-sm">{county.county}</span>
                    <span className="text-text-light text-xs ml-1">
                      {county.facility_count} facilit{county.facility_count !== 1 ? "ies" : "y"}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Nearby States */}
          {nearbyStates.length > 0 && (
            <div>
              <h2 className="font-serif text-2xl font-bold text-primary mb-4">
                Nearby States
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {nearbyStates.map((s) => (
                  <Link
                    key={s.slug}
                    href={`/${s.slug}`}
                    className="border border-border rounded-lg px-4 py-3 hover:shadow-sm transition-shadow"
                  >
                    <span className="font-semibold text-primary text-sm">{s.name}</span>
                    <span className="text-text-light text-xs ml-1">
                      {s.facility_count} facilit{s.facility_count !== 1 ? "ies" : "y"}
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
