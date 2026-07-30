import type { Metadata } from "next";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import { canonicalUrl } from "@/app/seo";

export const metadata: Metadata = {
  title: "Suggest a Facility",
  description:
    "Know a landfill, transfer station, or recycling center we're missing? Send it in and we'll add it to the directory.",
  alternates: { canonical: canonicalUrl("/submit") },
};

const SUBMIT_EMAIL = "hello@wheretodump.com";

export default function SubmitPage() {
  const mailto = `mailto:${SUBMIT_EMAIL}?subject=${encodeURIComponent("Facility suggestion for Where To Dump")}`;

  return (
    <section className="px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Suggest a Facility" },
            ]}
          />
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-2">
          Suggest a facility
        </h1>
        <p className="text-text-mid text-lg mb-8">
          Know a landfill, transfer station, recycling center, or dump site
          that&apos;s not in our directory? Send it over and we&apos;ll add it.
        </p>

        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-8">
          <h2 className="font-serif text-xl font-bold text-primary mb-3">
            Email us the details
          </h2>
          <p className="text-text-mid mb-4">
            Include whatever you have. At minimum, the facility name and city.
            Helpful extras:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-text-mid text-sm mb-6">
            <li>Facility name and address</li>
            <li>What it is (landfill, transfer station, recycling center, e-waste, scrap yard, RV dump)</li>
            <li>Website or phone number</li>
            <li>Anything you know about fees or residency rules</li>
          </ul>
          <a
            href={mailto}
            className="inline-block bg-accent text-white px-6 py-3.5 rounded-xl font-semibold hover:bg-accent-light transition-colors"
          >
            Email {SUBMIT_EMAIL}
          </a>
        </div>

        <p className="text-sm text-text-light">
          We review every suggestion before it goes live. A proper submission
          form is coming, but for now email works. In the meantime you can{" "}
          <Link href="/states" className="text-accent font-semibold hover:underline">
            browse facilities by state
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
