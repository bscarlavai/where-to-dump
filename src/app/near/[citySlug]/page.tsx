import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { FacilityCard } from "@/components/FacilityCard";
import Breadcrumb from "@/components/Breadcrumb";
import { getNearbyCities } from "@/lib/queries/cities";
import { getNearbyFacilities } from "@/lib/queries/facilities";
import { CATEGORY_SLUG_MAP, CATEGORY_SEO_LABELS } from "@/lib/constants/facility-types";
import { canonicalUrl } from "@/app/seo";
import { findCity } from "../find-city";

export const dynamicParams = true;

type Props = { params: Promise<{ citySlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { citySlug } = await params;
  const city = await findCity(citySlug);
  if (!city) return { title: "City Not Found" };

  return {
    title: `Dumps & Waste Disposal Near ${city.name}, ${city.state_abbr}`,
    description: `Find landfills, transfer stations, recycling centers, and e-waste drop-off near ${city.name}, ${city.state_abbr}. Browse facilities within 30 miles with hours and ratings.`,
    alternates: { canonical: canonicalUrl(`/near/${citySlug}`) },
  };
}

export default async function NearCityPage({ params }: Props) {
  const { citySlug } = await params;
  const city = await findCity(citySlug);
  if (!city || city.lat == null || city.lng == null) notFound();

  const [facilities, nearbyCities] = await Promise.all([
    getNearbyFacilities(city.lat, city.lng, 30, 30),
    getNearbyCities(city.state_slug, city.slug),
  ]);

  // Count categories for the sub-pages
  const catCounts: Record<string, number> = {};
  for (const [slug, type] of Object.entries(CATEGORY_SLUG_MAP)) {
    const n = facilities.filter(
      (f) => f.facility_type === type || f.secondary_types.includes(type)
    ).length;
    if (n > 0) catCounts[slug] = n;
  }

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
                name: `Where can I dump trash near ${city.name}, ${city.state_abbr}?`,
                acceptedAnswer: {
                  "@type": "Answer",
                  text:
                    facilities.length > 0
                      ? `There are ${facilities.length} waste disposal facilities within 30 miles of ${city.name}, ${city.state_abbr}, including landfills, transfer stations, and recycling centers, with hours and ratings on Where To Dump.`
                      : `We're still building our directory near ${city.name}. Check back soon or try searching a nearby city.`,
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
                { label: `Near ${city.name}` },
              ]}
            />
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-2">
            Waste Disposal Near {city.name}, {city.state_abbr}
          </h1>
          <p className="text-text-mid text-lg mb-8">
            {facilities.length} facilit{facilities.length !== 1 ? "ies" : "y"} within 30 miles
          </p>

          {/* Category sub-pages */}
          {Object.keys(catCounts).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-8">
              {Object.keys(CATEGORY_SLUG_MAP).filter((slug) => catCounts[slug]).map((slug) => (
                <Link
                  key={slug}
                  href={`/near/${citySlug}/${slug}`}
                  className="tag-activity text-sm font-semibold px-3.5 py-1.5 rounded-full hover:opacity-80 transition-opacity"
                >
                  {CATEGORY_SEO_LABELS[slug]} {catCounts[slug]}
                </Link>
              ))}
            </div>
          )}

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
                No facilities found within 30 miles
              </p>
              <p className="text-text-light text-sm">
                Try browsing{" "}
                <Link href={`/${city.state_slug}`} className="text-accent font-semibold hover:underline">
                  all facilities in {city.state_abbr}
                </Link>
              </p>
            </div>
          )}

          {/* SEO content */}
          <section className="mb-12">
            <h2 className="font-serif text-xl font-bold text-primary mb-4">
              About Waste Disposal Near {city.name}
            </h2>
            <div className="space-y-4 text-sm text-text leading-relaxed">
              <p>
                Need to get rid of a load near {city.name}, {city.state_abbr}? Where To Dump
                lists {facilities.length} facilit{facilities.length !== 1 ? "ies" : "y"} within
                30 miles: landfills, transfer stations, recycling centers, e-waste drop-off,
                and scrap yards. Each listing includes hours, contact info, and Google ratings.
              </p>
              <p>
                Call before you haul. Fees are usually charged per load or per ton, some sites
                only serve local residents, and accepted materials vary. Most regular facilities
                won&apos;t take paint, chemicals, or batteries. Check each listing for details.
              </p>
            </div>
          </section>

          {/* Nearby cities */}
          {nearbyCities.length > 0 && (
            <section className="mb-10">
              <h2 className="font-serif text-xl font-bold text-primary mb-4">
                Other Cities with Facilities
              </h2>
              <div className="flex flex-wrap gap-2">
                {nearbyCities.map((nc) => (
                  <Link
                    key={`${nc.state_slug}-${nc.slug}`}
                    href={`/near/${nc.slug}`}
                    className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-primary hover:border-accent hover:text-accent transition-colors"
                  >
                    Near {nc.name}, {nc.state_abbr}
                    <span className="text-text-light ml-1">
                      ({nc.facility_count}) · {Math.round(nc.distance_miles)} mi
                    </span>
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
