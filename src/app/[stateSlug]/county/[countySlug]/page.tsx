import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCountyInfo, getCountiesByState } from "@/lib/queries/counties";
import { getFacilitiesByCounty } from "@/lib/queries/facilities";
import { getCitiesByState } from "@/lib/queries/cities";
import { getStateBySlug } from "@/lib/queries/states";
import { FacilityCard } from "@/components/FacilityCard";
import Breadcrumb from "@/components/Breadcrumb";
import { canonicalUrl } from "@/app/seo";

type Props = {
  params: Promise<{ stateSlug: string; countySlug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stateSlug, countySlug } = await params;

  const [county, state] = await Promise.all([
    getCountyInfo(stateSlug, countySlug),
    getStateBySlug(stateSlug),
  ]);

  if (!county || !state) {
    return { title: "County Not Found" };
  }

  return {
    title: `Landfills & Waste Disposal in ${county.county}, ${state.name}`,
    description: `Find ${county.facility_count} waste disposal facilities in ${county.county}, ${state.name}: landfills, transfer stations, recycling centers, and more across ${county.city_count} cities.`,
    alternates: { canonical: canonicalUrl(`/${stateSlug}/county/${countySlug}`) },
  };
}

export default async function CountyPage({ params }: Props) {
  const { stateSlug, countySlug } = await params;

  const [county, state, facilities, allCounties, allCities] = await Promise.all([
    getCountyInfo(stateSlug, countySlug),
    getStateBySlug(stateSlug),
    getFacilitiesByCounty(stateSlug, countySlug),
    getCountiesByState(stateSlug),
    getCitiesByState(stateSlug),
  ]);

  if (!county || !state) notFound();

  const countyName = county.county;
  const cities = allCities.filter((c) => c.county_slug === countySlug);
  const otherCounties = allCounties.filter((c) => c.county_slug !== countySlug);
  const topFacility = facilities[0];

  // FAQ — plain text for JSON-LD, JSX for rendered display
  const faqItems = [
    {
      q: `Where can I dump trash in ${countyName}, ${state.name}?`,
      text: `There ${county.facility_count === 1 ? "is" : "are"} ${county.facility_count} waste disposal facilit${county.facility_count !== 1 ? "ies" : "y"} across ${county.city_count} cities in ${countyName}, ${state.name}, including landfills, transfer stations, and recycling centers.`,
      jsx: <>There {county.facility_count === 1 ? "is" : "are"} {county.facility_count} waste disposal facilit{county.facility_count !== 1 ? "ies" : "y"} across {county.city_count} cities in {countyName},{" "}
        <Link href={`/${stateSlug}`} className="text-accent font-semibold hover:underline">{state.name}</Link>,
        including landfills, transfer stations, and recycling centers.
      </>,
    },
    {
      q: `Do I have to be a ${countyName} resident to use the dump?`,
      text: `It depends on the facility. County-run sites often serve residents only, or charge non-residents a higher rate, and may ask for ID or a utility bill as proof of residency. Private facilities usually take anyone willing to pay the gate fee. Check the listing or call ahead.`,
      jsx: <>It depends on the facility. County-run sites often serve residents only, or charge non-residents a higher rate, and may ask for ID or a utility bill as proof of residency. Private facilities usually take anyone willing to pay the gate fee. Check the listing or call ahead.</>,
    },
    {
      q: `What is the best-rated facility in ${countyName}?`,
      text: topFacility?.google_rating
        ? `The top facility in ${countyName} is ${topFacility.name} in ${topFacility.city} with a ${topFacility.google_rating}-star rating from ${topFacility.google_review_count?.toLocaleString()} Google reviews.`
        : `Browse all ${county.facility_count} facilities in ${countyName} to compare ratings and hours.`,
      jsx: topFacility?.google_rating
        ? <>The top facility in {countyName} is{" "}
            <Link href={`/${topFacility.state_slug}/${topFacility.city_slug}/${topFacility.slug}`} className="text-accent font-semibold hover:underline">{topFacility.name}</Link>
            {" "}in{" "}
            <Link href={`/${stateSlug}/${topFacility.city_slug}`} className="text-accent font-semibold hover:underline">{topFacility.city}</Link>
            {" "}with a {topFacility.google_rating}-star rating from {topFacility.google_review_count?.toLocaleString()} Google reviews.
          </>
        : <>Browse all {county.facility_count} facilities in {countyName} to compare ratings and hours.</>,
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
                { label: state.name, href: `/${stateSlug}` },
                { label: countyName },
              ]}
            />
          </div>

          {/* Hero */}
          <div className="mb-10">
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-2">
              Waste Disposal in {countyName}, {state.abbreviation}
            </h1>
            <p className="text-text-mid text-lg max-w-2xl">
              {county.facility_count} facilit{county.facility_count !== 1 ? "ies" : "y"} across {county.city_count} {county.city_count === 1 ? "city" : "cities"}: landfills, transfer stations, recycling centers, and more.
            </p>
          </div>

          {/* Facility Grid */}
          {facilities.length > 0 ? (
            <div className="mb-12">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {facilities.map((facility) => (
                  <FacilityCard key={facility.id} facility={facility} />
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-accent-pale border border-accent/15 rounded-xl px-5 py-3.5 mb-10">
              <p className="text-sm text-text">
                No facilities listed in {countyName} yet.{" "}
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
                About Waste Disposal in {countyName}
              </h2>
              <div className="space-y-4 text-text-mid leading-relaxed">
                <p>
                  {countyName} in{" "}
                  <Link href={`/${stateSlug}`} className="text-accent font-semibold hover:underline">{state.name}</Link>
                  {" "}has {county.facility_count} listed waste disposal facilit{county.facility_count !== 1 ? "ies" : "y"} spread across {county.city_count} {county.city_count === 1 ? "city" : "cities"}.
                  Listings include hours, contact info, and ratings so you can pick a site before you load up.
                  {topFacility?.google_rating && (
                    <> The highest rated is{" "}
                      <Link href={`/${topFacility.state_slug}/${topFacility.city_slug}/${topFacility.slug}`} className="text-accent font-semibold hover:underline">
                        {topFacility.name}
                      </Link>
                      {" "}in{" "}
                      <Link href={`/${stateSlug}/${topFacility.city_slug}`} className="text-accent font-semibold hover:underline">{topFacility.city}</Link>
                      , rated {topFacility.google_rating} stars from {topFacility.google_review_count?.toLocaleString()} reviews.
                    </>
                  )}
                </p>
                <p>
                  County facilities are where residency rules show up most: many {countyName} sites
                  offer free or discounted dumping for residents and turn away or surcharge everyone
                  else. Bring ID, call ahead for current fees, and keep hazardous materials separate.
                  Paint, chemicals, and batteries usually need a dedicated hazardous waste drop-off.
                </p>
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

          {/* Cities in this County */}
          {cities.length > 0 && (
            <div className="mb-12 bg-primary-pale rounded-2xl p-6 sm:p-8">
              <h2 className="font-serif text-2xl font-bold text-primary mb-4">
                Cities in {countyName}
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

          {/* Back to state */}
          <div className="mb-12">
            <Link
              href={`/${stateSlug}`}
              className="text-accent font-semibold hover:underline"
            >
              Browse all facilities in {state.name} &rarr;
            </Link>
          </div>

          {/* Other Counties in State */}
          {otherCounties.length > 0 && (
            <div>
              <h2 className="font-serif text-2xl font-bold text-primary mb-4">
                Other Counties in {state.name}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {otherCounties.map((c) => (
                  <Link
                    key={c.county_slug}
                    href={`/${stateSlug}/county/${c.county_slug}`}
                    className="border border-border rounded-lg px-4 py-3 hover:shadow-sm transition-shadow"
                  >
                    <span className="font-semibold text-primary text-sm">{c.county}</span>
                    <span className="text-text-light text-xs ml-1">
                      {c.facility_count} facilit{c.facility_count !== 1 ? "ies" : "y"}
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
