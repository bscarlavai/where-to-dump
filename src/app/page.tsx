import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORY_SEO_LABELS } from "@/lib/constants/facility-types";
import { FacilityCard } from "@/components/FacilityCard";
import { getFeaturedFacilities } from "@/lib/queries/facilities";
import { getAllStates } from "@/lib/queries/states";
import { canonicalUrl } from "./seo";

export const revalidate = 3600; // revalidate every hour

export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl("/") },
};

export default async function HomePage() {
  const [facilities, states] = await Promise.all([
    getFeaturedFacilities(6),
    getAllStates(),
  ]);

  const statesWithFacilities = states.filter((s) => s.facility_count > 0);
  const totalFacilities = statesWithFacilities.reduce((sum, s) => sum + s.facility_count, 0);
  const topStates = statesWithFacilities.length > 0
    ? statesWithFacilities.slice(0, 12)
    : states.slice(0, 12);

  return (
    <>
      {/* Hero */}
      <section
        className="px-4 pt-12 pb-10 text-center"
        style={{
          background: "linear-gradient(135deg, #101113 0%, #1B1C1E 45%, #2A2C2F 100%)",
        }}
      >
        {/* Stats pill */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/15 bg-white/8 mb-8">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-xs font-semibold tracking-wider text-white/70 uppercase">
            {totalFacilities.toLocaleString()} facilities across {statesWithFacilities.length}{" "}
            {statesWithFacilities.length === 1 ? "state" : "states"}
          </span>
        </div>

        <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight mb-5">
          Find the nearest dump,<br />
          <span className="text-accent">transfer station, or recycling center</span>
        </h1>
        <p className="text-white/60 text-lg max-w-lg mx-auto mb-6">
          Landfills, transfer stations, recycling centers, e-waste drop-off, scrap yards, and RV dump stations, with hours, fees, and what they accept.
        </p>

        {/* Search bar */}
        <form action="/search" className="max-w-xl mx-auto flex bg-white rounded-xl overflow-hidden shadow-lg">
          <input
            type="text"
            name="q"
            placeholder="City, ZIP, or facility name..."
            className="flex-1 px-5 py-4 text-base text-text outline-none font-sans bg-transparent"
          />
          <button type="submit" className="bg-accent text-white px-7 py-4 font-semibold text-sm hover:bg-accent-light transition-colors">
            Search
          </button>
        </form>
      </section>

      {/* Category pills */}
      <section className="px-4 pt-8 pb-8">
        <div className="max-w-3xl mx-auto flex flex-wrap justify-center gap-2">
          {Object.entries(CATEGORY_SEO_LABELS).map(([slug, label]) => (
            <Link
              key={slug}
              href="/near-me"
              className="bg-primary-pale text-primary border border-primary/10 px-4 py-2 rounded-full text-sm font-semibold hover:bg-primary hover:text-white hover:border-transparent transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>
      </section>

      {/* Featured facilities */}
      {facilities.length > 0 && (
        <section className="px-4 pb-12">
          <div className="max-w-6xl mx-auto">
            <h2 className="font-serif text-2xl font-bold text-primary mb-6">
              Popular facilities
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {facilities.map((facility) => (
                <FacilityCard key={facility.id} facility={facility} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Browse by state */}
      <section className="px-4 pb-16 bg-card border-t border-border pt-12">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-serif text-2xl font-bold text-primary mb-6 text-center">
            Browse by state
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {topStates.map((state) => (
              <Link
                key={state.slug}
                href={`/${state.slug}`}
                className="bg-bg border border-border rounded-xl px-4 py-3 text-sm font-medium text-primary hover:border-accent hover:text-accent transition-colors text-center"
              >
                {state.name}
                {state.facility_count > 0 && (
                  <span className="block text-xs text-text-light mt-0.5">
                    {state.facility_count} facilities
                  </span>
                )}
              </Link>
            ))}
          </div>
          <div className="text-center mt-6">
            <Link href="/states" className="text-accent font-semibold text-sm hover:underline">
              View all 50 states &rarr;
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
