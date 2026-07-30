import type { Metadata } from "next";
import Breadcrumb from "@/components/Breadcrumb";
import { canonicalUrl } from "@/app/seo";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Where To Dump privacy policy: how we collect, use, and protect your information.",
  alternates: { canonical: canonicalUrl("/privacy") },
};

export default function PrivacyPage() {
  return (
    <section className="px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Privacy Policy" },
            ]}
          />
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-2">Privacy Policy</h1>
        <p className="text-sm text-text-light mb-8">Last updated: July 2026</p>

        <div className="space-y-8 text-sm text-text leading-relaxed">
          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Information We Collect</h2>
            <p className="mb-2">We may collect the following information when you use Where To Dump:</p>
            <ul className="list-disc pl-5 space-y-1 text-text-mid">
              <li><strong>Contact information:</strong> Email address if you contact us or suggest a facility.</li>
              <li><strong>User-submitted content:</strong> Facility suggestions and corrections you provide.</li>
              <li><strong>Usage data:</strong> IP address, browser type, pages visited, and referring URLs collected automatically.</li>
              <li><strong>Location data:</strong> Approximate location when you use the &quot;Near Me&quot; feature (only with your permission).</li>
              <li><strong>Cookies:</strong> Essential cookies for site functionality and optional analytics cookies.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1 text-text-mid">
              <li>To operate and improve the Where To Dump directory.</li>
              <li>To show nearby facilities based on your location.</li>
              <li>To review and follow up on facility suggestions.</li>
              <li>To prevent spam and abuse.</li>
              <li>To display relevant advertising.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Third-Party Services</h2>
            <p className="text-text-mid">We use the following third-party services that may collect data:</p>
            <ul className="list-disc pl-5 space-y-1 text-text-mid mt-2">
              <li><strong>Google Maps:</strong> For map displays and location data.</li>
              <li><strong>Cloudflare:</strong> For hosting, data storage, and content delivery.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Cookies</h2>
            <p className="text-text-mid">We use essential cookies for site functionality. We may also use analytics cookies to understand how visitors use the site. You can disable cookies in your browser settings, though some features may not work properly.</p>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Data Retention</h2>
            <p className="text-text-mid">Facility suggestions become part of the public directory and are stored indefinitely. IP addresses and usage logs are retained temporarily for security purposes.</p>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Children&apos;s Privacy</h2>
            <p className="text-text-mid">Where To Dump does not knowingly collect personal information from children under 13. If you believe we have collected information from a child, please contact us and we will remove it promptly.</p>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Your Rights</h2>
            <p className="text-text-mid">Depending on your location, you may have rights to access, correct, or delete your personal data. California residents have additional rights under the CCPA. EU residents have rights under the GDPR. Contact us to exercise these rights.</p>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Changes to This Policy</h2>
            <p className="text-text-mid">We may update this privacy policy from time to time. Changes will be posted on this page with an updated date.</p>
          </div>

          <div>
            <h2 className="font-serif text-xl font-bold text-primary mb-3">Contact</h2>
            <p className="text-text-mid">
              Questions about this policy? Contact us at{" "}
              <a href="mailto:hello@wheretodump.com" className="text-accent font-semibold hover:underline">hello@wheretodump.com</a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
