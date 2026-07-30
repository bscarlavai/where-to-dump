import type { Metadata } from "next";
import Link from "next/link";
import { IconCheck } from "@/components/icons";
import Breadcrumb from "@/components/Breadcrumb";
import { canonicalUrl } from "@/app/seo";

export const metadata: Metadata = {
  title: "About Where To Dump",
  description:
    "Where To Dump helps you find landfills, transfer stations, recycling centers, e-waste drop-off, scrap yards, and RV dump stations across the United States.",
  alternates: { canonical: canonicalUrl("/about") },
};

export default function AboutPage() {
  return (
    <section className="px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "About" },
            ]}
          />
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-6">
          About Where To Dump
        </h1>

        <div className="prose prose-lg max-w-none text-text space-y-5">
          <p className="text-lg text-text-mid leading-relaxed">
            Where To Dump answers one question: you have a load of stuff to get
            rid of. Where do you take it, and what will it cost? We list waste
            disposal facilities across the United States with hours, fees,
            accepted materials, and directions, so you can find the right site
            before you load the truck.
          </p>

          <h2 className="font-serif text-2xl font-bold text-primary mt-10 mb-3">
            What we cover
          </h2>
          <p className="text-text-mid leading-relaxed">
            Our directory includes the full range of disposal and recycling
            options:
          </p>
          <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-text-mid list-none pl-0 my-4">
            {[
              "Landfills & dumps",
              "Waste transfer stations",
              "Recycling centers",
              "E-waste & electronics drop-off",
              "Scrap metal yards",
              "Household hazardous waste sites",
              "RV dump stations",
              "Yard waste & composting sites",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <IconCheck className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <h2 className="font-serif text-2xl font-bold text-primary mt-10 mb-3">
            Who it&apos;s for
          </h2>
          <p className="text-text-mid leading-relaxed">
            Homeowners clearing out a garage, renters moving out with a truckload
            of junk, contractors hauling construction debris, RVers looking for
            the next dump station, and anyone Googling &quot;where can I take
            this?&quot; at 7am on a Saturday.
          </p>

          <h2 className="font-serif text-2xl font-bold text-primary mt-10 mb-3">
            How it works
          </h2>
          <p className="text-text-mid leading-relaxed">
            We build listings from public records, state permit databases, and
            Google Maps data, then add the details that actually matter: what a
            facility accepts, what it charges, and whether it&apos;s restricted
            to local residents. Fees and hours change, so we always recommend
            calling ahead before you haul.
          </p>

          <h2 className="font-serif text-2xl font-bold text-primary mt-10 mb-3">
            Know a facility we&apos;re missing?
          </h2>
          <p className="text-text-mid leading-relaxed">
            We&apos;re always growing the directory.{" "}
            <Link
              href="/submit"
              className="text-accent font-semibold hover:underline"
            >
              Suggest a facility
            </Link>{" "}
            and help the next person with a full truck.
          </p>

          <h2 className="font-serif text-2xl font-bold text-primary mt-10 mb-3">
            Contact us
          </h2>
          <p className="text-text-mid leading-relaxed">
            Questions, corrections, or partnership inquiries? Reach us at{" "}
            <a
              href="mailto:hello@wheretodump.com"
              className="text-accent font-semibold hover:underline"
            >
              hello@wheretodump.com
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
