import type { Metadata } from "next";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import { getAllStates } from "@/lib/queries/states";
import { canonicalUrl } from "@/app/seo";

export const metadata: Metadata = {
  title: "Browse Waste Disposal Facilities by State",
  description:
    "Find landfills, transfer stations, recycling centers, e-waste drop-off, and scrap yards in all 50 states.",
  alternates: { canonical: canonicalUrl("/states") },
};

export const revalidate = 3600;

export default async function StatesPage() {
  const states = await getAllStates();

  return (
    <section className="px-4 py-12">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "States" },
            ]}
          />
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-2">
          Browse facilities by state
        </h1>
        <p className="text-text-mid text-lg mb-10 max-w-2xl">
          Landfills, transfer stations, recycling centers, and more across the
          United States.
        </p>

        {/* State grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {states.map((state) => (
            <Link
              key={state.slug}
              href={`/${state.slug}`}
              className="bg-card border border-border rounded-2xl px-5 py-4 hover:border-accent hover:shadow-sm transition-all group"
            >
              <div className="font-serif font-bold text-primary group-hover:text-accent transition-colors">
                {state.name}
              </div>
              <div className="text-sm text-text-mid mt-0.5">
                {state.facility_count > 0 ? `${state.facility_count} facilities` : "Coming soon"}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
