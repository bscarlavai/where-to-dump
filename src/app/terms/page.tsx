import type { Metadata } from "next";
import Breadcrumb from "@/components/Breadcrumb";
import { canonicalUrl } from "@/app/seo";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Where To Dump terms of service: rules and guidelines for using the site.",
  alternates: { canonical: canonicalUrl("/terms") },
};

export default function TermsPage() {
  return (
    <section className="px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Terms of Service" },
            ]}
          />
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-2">Terms of Service</h1>
        <p className="text-sm text-text-light mb-8">Last updated: July 2026</p>

        <div className="space-y-8 text-sm text-text leading-relaxed">
          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Acceptance of Terms</h2>
            <p className="text-text-mid">By accessing or using Where To Dump (&quot;the Service&quot;), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service.</p>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Description of Service</h2>
            <p className="text-text-mid">Where To Dump is a free directory of waste disposal facilities across the United States: landfills, transfer stations, recycling centers, e-waste drop-off sites, scrap yards, and RV dump stations. Users can browse listings and suggest new facilities.</p>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">User-Submitted Content</h2>
            <p className="text-text-mid mb-2">By submitting facility suggestions, corrections, or other content, you grant Where To Dump a non-exclusive, royalty-free, worldwide license to use, display, and distribute your content in connection with the Service. You represent that:</p>
            <ul className="list-disc pl-5 space-y-1 text-text-mid">
              <li>Your content is accurate and not misleading.</li>
              <li>You own or have the right to share the content.</li>
              <li>Your content does not violate any laws or third-party rights.</li>
            </ul>
            <p className="text-text-mid mt-2">We reserve the right to remove any content that violates these terms or is deemed inappropriate.</p>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Accuracy of Information</h2>
            <p className="text-text-mid">Facility listings, hours, fees, accepted materials, and other information are provided on an &quot;as-is&quot; basis. We make no guarantees about the accuracy, completeness, or timeliness of any listing. Fees and access rules change often, so always contact a facility directly to verify details before hauling a load.</p>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Prohibited Conduct</h2>
            <p className="text-text-mid mb-2">You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1 text-text-mid">
              <li>Submit false, misleading, or spam content.</li>
              <li>Harass, threaten, or abuse other users.</li>
              <li>Scrape, crawl, or automatically access the Service beyond what is permitted by robots.txt.</li>
              <li>Attempt to gain unauthorized access to the Service or its systems.</li>
              <li>Use the Service for any unlawful purpose.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Intellectual Property</h2>
            <p className="text-text-mid">The Where To Dump name, logo, design, and original content are the property of Where To Dump. Facility data sourced from public records and Google Maps is used in accordance with applicable terms of service.</p>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Third-Party Links</h2>
            <p className="text-text-mid">The Service contains links to third-party websites (facility websites, Google Maps, etc.). We are not responsible for the content, accuracy, or practices of these external sites.</p>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Limitation of Liability</h2>
            <p className="text-text-mid">Where To Dump is provided &quot;as is&quot; without warranties of any kind. We shall not be liable for any direct, indirect, incidental, or consequential damages arising from your use of the Service, including but not limited to reliance on listing information, travel to facility locations, disposal fees, or interactions with facility operators.</p>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Indemnification</h2>
            <p className="text-text-mid">You agree to indemnify and hold harmless Where To Dump and its operators from any claims, damages, or expenses arising from your use of the Service or violation of these terms.</p>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Changes to These Terms</h2>
            <p className="text-text-mid">We may update these terms from time to time. Continued use of the Service after changes constitutes acceptance of the updated terms.</p>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Governing Law</h2>
            <p className="text-text-mid">These terms are governed by the laws of the United States. Any disputes shall be resolved in the appropriate courts.</p>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Contact</h2>
            <p className="text-text-mid">
              Questions about these terms? Contact us at{" "}
              <a href="mailto:hello@wheretodump.com" className="text-accent font-semibold hover:underline">hello@wheretodump.com</a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
