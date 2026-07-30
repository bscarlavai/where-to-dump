import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { FacilityCard } from "@/components/FacilityCard";
import Breadcrumb from "@/components/Breadcrumb";
import { getNearbyCities } from "@/lib/queries/cities";
import { getNearbyFacilities } from "@/lib/queries/facilities";
import { CATEGORY_SLUG_MAP, CATEGORY_SEO_LABELS } from "@/lib/constants/facility-types";
import { canonicalUrl } from "@/app/seo";
import { findCity } from "../../find-city";

export const dynamicParams = true;

type Props = { params: Promise<{ citySlug: string; categorySlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { citySlug, categorySlug } = await params;
  const facilityType = CATEGORY_SLUG_MAP[categorySlug];
  if (!facilityType) return { title: "Not Found" };

  const city = await findCity(citySlug);
  if (!city) return { title: "City Not Found" };

  const label = CATEGORY_SEO_LABELS[categorySlug];
  const title = `${label} Near ${city.name}, ${city.state_abbr}`;
  const description = `Find ${label.toLowerCase()} near ${city.name}, ${city.state_abbr}. Browse locations within 40 miles with hours, ratings, and directions.`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl(`/near/${citySlug}/${categorySlug}`) },
  };
}

export default async function NearCityCategoryPage({ params }: Props) {
  const { citySlug, categorySlug } = await params;
  const facilityType = CATEGORY_SLUG_MAP[categorySlug];
  if (!facilityType) notFound();

  const city = await findCity(citySlug);
  if (!city || city.lat == null || city.lng == null) notFound();

  const [facilities, nearbyCities] = await Promise.all([
    getNearbyFacilities(city.lat, city.lng, 40, 30, facilityType),
    getNearbyCities(city.state_slug, city.slug),
  ]);
  const label = CATEGORY_SEO_LABELS[categorySlug];

  // Other categories available near this city
  const otherCategories = Object.keys(CATEGORY_SLUG_MAP).filter((slug) => slug !== categorySlug);

  const topFacility = facilities[0];

  return (
    <>
      {/* FAQ Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: `Are there ${label.toLowerCase()} near ${city.name}, ${city.state_abbr}?`,
                acceptedAnswer: {
                  "@type": "Answer",
                  text:
                    facilities.length > 0
                      ? `Yes. There are ${facilities.length} ${label.toLowerCase()} within 40 miles of ${city.name}, ${city.state_abbr}, listed on Where To Dump with hours and ratings.`
                      : `We haven't found ${label.toLowerCase()} near ${city.name} yet. Try browsing all waste facilities nearby instead.`,
                },
              },
              {
                "@type": "Question",
                name: `What is the closest option near ${city.name}?`,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: topFacility
                    ? `The nearest is ${topFacility.name} in ${topFacility.city}, about ${Math.round(topFacility.distance_miles)} miles away. Call ahead to confirm hours, fees, and what it accepts.`
                    : `Browse our listings to find the best options near ${city.name}.`,
                },
              },
            ],
          }),
        }}
      />

      <section className="px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <Breadcrumb
              items={[
                { label: "Home", href: "/" },
                { label: `Near ${city.name}`, href: `/near/${citySlug}` },
                { label },
              ]}
            />
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-2">
            {label} Near {city.name}, {city.state_abbr}
          </h1>
          <p className="text-text-mid text-lg mb-8">
            {facilities.length} {facilities.length === 1 ? "location" : "locations"} within 40 miles
          </p>

          {/* Results */}
          {facilities.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
              {facilities.map((facility) => (
                <FacilityCard key={facility.id} facility={facility} />
              ))}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl p-8 text-center mb-12">
              <p className="text-text-mid font-medium mb-2">
                No {label.toLowerCase()} found within 40 miles
              </p>
              <p className="text-text-light text-sm">
                <Link href={`/near/${citySlug}`} className="text-accent font-semibold hover:underline">
                  View all facilities near {city.name}
                </Link>
              </p>
            </div>
          )}

          {/* SEO content */}
          <section className="mb-12">
            <h2 className="font-serif text-xl font-bold text-primary mb-4">
              About {label} Near {city.name}
            </h2>
            <div className="space-y-4 text-sm text-text leading-relaxed">
              <p>
                Where To Dump lists {facilities.length} {label.toLowerCase()} within 40 miles of{" "}
                {city.name}, {city.state_abbr}, with hours, contact info, and Google ratings.
                Call before you go. Fees and accepted materials vary by site, and some
                facilities only serve local residents.
              </p>
            </div>
          </section>

          {/* Other categories */}
          <section className="mb-10">
            <h2 className="font-serif text-xl font-bold text-primary mb-4">
              More Near {city.name}
            </h2>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/near/${citySlug}`}
                className="bg-primary-pale text-primary border border-primary/10 px-3.5 py-1.5 rounded-full text-sm font-semibold hover:bg-primary hover:text-white hover:border-transparent transition-colors"
              >
                All Facilities
              </Link>
              {otherCategories.map((slug) => (
                <Link
                  key={slug}
                  href={`/near/${citySlug}/${slug}`}
                  className="bg-primary-pale text-primary border border-primary/10 px-3.5 py-1.5 rounded-full text-sm font-semibold hover:bg-primary hover:text-white hover:border-transparent transition-colors"
                >
                  {CATEGORY_SEO_LABELS[slug]}
                </Link>
              ))}
            </div>
          </section>

          {/* Nearby cities with same category */}
          {nearbyCities.length > 0 && (
            <section>
              <h2 className="font-serif text-xl font-bold text-primary mb-4">
                {label} in Nearby Cities
              </h2>
              <div className="flex flex-wrap gap-2">
                {nearbyCities.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/near/${c.slug}/${categorySlug}`}
                    className="border border-border rounded-full px-4 py-2 hover:shadow-sm transition-shadow text-sm"
                  >
                    <span className="font-semibold text-primary">{c.name}</span>
                    <span className="text-text-light ml-1">&middot; {Math.round(c.distance_miles)} mi</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </section>
    </>
  );
}
