import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FACILITY_TYPE_LABELS, MATERIAL_LABELS } from "@/lib/constants/facility-types";
import { StarRatingDisplay } from "@/components/StarRating";
import { FacilityMapLazy } from "@/components/FacilityMapLazy";
import { FacilityImage } from "@/components/FacilityImage";
import Breadcrumb from "@/components/Breadcrumb";
import { getFacilityBySlug } from "@/lib/queries/facilities";
import { getStateBySlug } from "@/lib/queries/states";
import { getCityBySlug } from "@/lib/queries/cities";
import { canonicalUrl } from "@/app/seo";
import type { FacilityType } from "@/types";

type Props = {
  params: Promise<{
    stateSlug: string;
    citySlug: string;
    locationSlug: string;
  }>;
};

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function sortedHours(hours: Record<string, string> | null): Array<[string, string]> {
  if (!hours) return [];
  const rank = (day: string) => {
    const i = DAY_ORDER.indexOf(day);
    return i === -1 ? DAY_ORDER.length : i;
  };
  return Object.entries(hours).sort((a, b) => rank(a[0]) - rank(b[0]));
}

/** Human label for a fees key like "car_load" or "per-ton". */
function feeLabel(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stateSlug, citySlug, locationSlug } = await params;
  const facility = await getFacilityBySlug(stateSlug, citySlug, locationSlug);
  if (!facility) {
    return { title: "Facility Not Found" };
  }
  const typeLabel = FACILITY_TYPE_LABELS[facility.facility_type];
  return {
    title: `${facility.name} in ${facility.city}, ${facility.state_abbr}`,
    description:
      facility.description ||
      `${facility.name} is a ${typeLabel.toLowerCase()} in ${facility.city}, ${facility.state_abbr}. Get hours, directions, fees, and what this facility accepts.`,
    alternates: { canonical: canonicalUrl(`/${stateSlug}/${citySlug}/${locationSlug}`) },
  };
}

export default async function FacilityDetailPage({ params }: Props) {
  const { stateSlug, citySlug, locationSlug } = await params;
  const facility = await getFacilityBySlug(stateSlug, citySlug, locationSlug);

  if (!facility) notFound();

  const [state, cityInfo] = await Promise.all([
    getStateBySlug(stateSlug),
    getCityBySlug(stateSlug, citySlug),
  ]);
  const stateName = state?.name || facility.state;

  const hours = sortedHours(facility.google_hours);
  const secondaryTypes = facility.secondary_types.filter(
    (t): t is FacilityType => t !== facility.facility_type && t in FACILITY_TYPE_LABELS
  );
  const materials = facility.accepted_materials.filter((m) => MATERIAL_LABELS[m]);
  const feeEntries = facility.fees ? Object.entries(facility.fees) : [];
  const hasPermitInfo = Boolean(facility.operator || facility.permit_number);
  const fullAddress = [facility.street, facility.city, `${facility.state_abbr} ${facility.zip ?? ""}`.trim()]
    .filter(Boolean)
    .join(", ");

  const pageUrl = canonicalUrl(`/${stateSlug}/${citySlug}/${locationSlug}`);

  // LocalBusiness structured data
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: facility.name,
    url: pageUrl,
    address: {
      "@type": "PostalAddress",
      ...(facility.street ? { streetAddress: facility.street } : {}),
      addressLocality: facility.city,
      addressRegion: facility.state_abbr,
      ...(facility.zip ? { postalCode: facility.zip } : {}),
      addressCountry: "US",
    },
    ...(facility.lat != null && facility.lng != null
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: facility.lat,
            longitude: facility.lng,
          },
        }
      : {}),
    ...(facility.phone ? { telephone: facility.phone } : {}),
    ...(facility.website ? { sameAs: [facility.website] } : {}),
    ...(hours.length > 0
      ? { openingHours: hours.map(([day, value]) => `${day}: ${value}`) }
      : {}),
    ...(facility.google_rating != null
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: facility.google_rating,
            reviewCount: facility.google_review_count || 1,
          },
        }
      : {}),
  };

  return (
    <section className="px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        <div className="mb-6">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: stateName, href: `/${stateSlug}` },
              { label: facility.city, href: `/${stateSlug}/${citySlug}` },
              { label: facility.name },
            ]}
          />
        </div>

        {/* Hero image area */}
        <div className="rounded-2xl overflow-hidden mb-8">
          <FacilityImage
            src={facility.photo_url}
            cfImageId={facility.cf_image_id}
            variant="detail"
            alt={facility.name}
            className="w-full h-64 sm:h-80 object-cover"
            priority
          />
        </div>

        {/* Facility name, location, rating */}
        <div className="mb-6">
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-1">
            {facility.name}
          </h1>
          <p className="text-text-mid text-lg mb-3">
            {facility.city}, {facility.state_abbr}
            {facility.county && ` · ${facility.county}`}
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="tag-activity text-sm font-semibold px-3.5 py-1.5 rounded-full">
              {FACILITY_TYPE_LABELS[facility.facility_type]}
            </span>
            {secondaryTypes.map((type) => (
              <span
                key={type}
                className="tag-amenity text-sm font-semibold px-3.5 py-1.5 rounded-full"
              >
                {FACILITY_TYPE_LABELS[type]}
              </span>
            ))}
          </div>
          {facility.google_rating && (
            <StarRatingDisplay
              rating={facility.google_rating}
              count={facility.google_review_count ?? undefined}
              size="lg"
            />
          )}
        </div>

        {/* CTA buttons */}
        <div className="flex flex-wrap gap-3 mb-10">
          {facility.lat && facility.lng && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-accent text-white px-6 py-3.5 rounded-xl font-semibold hover:bg-accent-light transition-colors border-2 border-accent hover:border-accent-light inline-flex items-center justify-center leading-none"
            >
              Get Directions
            </a>
          )}
          {facility.phone && (
            <a
              href={`tel:${facility.phone}`}
              className="bg-card border-2 border-primary text-primary px-6 py-3.5 rounded-xl font-semibold hover:bg-primary hover:text-white transition-colors inline-flex items-center justify-center leading-none"
            >
              Call {facility.phone}
            </a>
          )}
          {facility.website && (
            <a
              href={facility.website}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-card border-2 border-primary text-primary px-6 py-3.5 rounded-xl font-semibold hover:bg-primary hover:text-white transition-colors inline-flex items-center justify-center leading-none"
            >
              Visit Website
            </a>
          )}
        </div>

        {/* Public access warning */}
        {facility.open_to_public === false && (
          <div className="bg-red-pale border border-red/20 rounded-xl px-5 py-3.5 mb-8">
            <p className="text-sm text-text">
              <strong className="text-red">Not open to the general public.</strong>{" "}
              This facility may only serve commercial haulers or permitted users. Call
              before hauling a load out here.
            </p>
          </div>
        )}

        {/* Description */}
        {facility.description && (
          <div className="mb-10">
            <p className="text-text leading-relaxed">{facility.description}</p>
          </div>
        )}

        {/* Accepted materials */}
        {materials.length > 0 && (
          <div className="mb-8">
            <h2 className="font-serif text-xl font-bold text-primary mb-3">
              Accepted Materials
            </h2>
            <div className="flex flex-wrap gap-2">
              {materials.map((item) => (
                <span
                  key={item}
                  className="tag-produce text-sm font-semibold px-3.5 py-1.5 rounded-full"
                >
                  {MATERIAL_LABELS[item]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Fees */}
        {feeEntries.length > 0 && (
          <div className="mb-8">
            <h2 className="font-serif text-xl font-bold text-primary mb-3">
              Fees
            </h2>
            <div className="bg-card border border-border rounded-2xl p-6">
              <dl className="grid sm:grid-cols-2 gap-4">
                {feeEntries.map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs font-semibold text-text-mid uppercase tracking-wide mb-1">
                      {feeLabel(key)}
                    </dt>
                    <dd className="text-text">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-text-light mt-4">
                Fees change. Call the facility to confirm current rates and payment methods.
              </p>
            </div>
          </div>
        )}

        {/* Free for residents */}
        {facility.free_for_residents && (
          <div className="mb-8">
            <div className="bg-green-pale border border-green/20 rounded-xl px-5 py-3.5">
              <p className="text-sm text-text">
                <strong className="text-green">Free for residents:</strong>{" "}
                this facility&apos;s published information indicates local residents can
                drop off at no charge (rules and materials vary, so confirm before hauling).
              </p>
            </div>
          </div>
        )}

        {/* Residency restriction */}
        {facility.residency_restriction && (
          <div className="mb-8">
            <div className="bg-accent-pale border border-accent/15 rounded-xl px-5 py-3.5">
              <p className="text-sm text-text">
                <strong className="text-primary">Residency restriction:</strong>{" "}
                {facility.residency_restriction}
              </p>
            </div>
          </div>
        )}

        {/* Info section */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-8">
          <h2 className="font-serif text-xl font-bold text-primary mb-4">
            Facility Information
          </h2>
          <dl className="grid sm:grid-cols-2 gap-4">
            {fullAddress && (
              <div>
                <dt className="text-xs font-semibold text-text-mid uppercase tracking-wide mb-1">
                  Address
                </dt>
                <dd className="text-text">{fullAddress}</dd>
              </div>
            )}
            {facility.phone && (
              <div>
                <dt className="text-xs font-semibold text-text-mid uppercase tracking-wide mb-1">
                  Phone
                </dt>
                <dd>
                  <a
                    href={`tel:${facility.phone}`}
                    className="text-accent hover:underline"
                  >
                    {facility.phone}
                  </a>
                </dd>
              </div>
            )}
            {facility.website && (
              <div>
                <dt className="text-xs font-semibold text-text-mid uppercase tracking-wide mb-1">
                  Website
                </dt>
                <dd>
                  <a
                    href={facility.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline break-all"
                  >
                    {facility.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                </dd>
              </div>
            )}
            {hours.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold text-text-mid uppercase tracking-wide mb-1">
                  Hours
                </dt>
                <dd className="text-text text-sm space-y-0.5">
                  {hours.map(([day, value]) => (
                    <div key={day} className="flex gap-3">
                      <span className="w-24 shrink-0 text-text-mid">{day}</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Permit / operator */}
        {hasPermitInfo && (
          <div className="bg-card border border-border rounded-2xl p-6 mb-8">
            <h2 className="font-serif text-xl font-bold text-primary mb-4">
              Operator &amp; Permit
            </h2>
            <dl className="grid sm:grid-cols-2 gap-4">
              {facility.operator && (
                <div>
                  <dt className="text-xs font-semibold text-text-mid uppercase tracking-wide mb-1">
                    Operator
                  </dt>
                  <dd className="text-text">{facility.operator}</dd>
                </div>
              )}
              {facility.permit_number && (
                <div>
                  <dt className="text-xs font-semibold text-text-mid uppercase tracking-wide mb-1">
                    Permit Number
                  </dt>
                  <dd className="text-text">{facility.permit_number}</dd>
                </div>
              )}
              {facility.permit_status && (
                <div>
                  <dt className="text-xs font-semibold text-text-mid uppercase tracking-wide mb-1">
                    Permit Status
                  </dt>
                  <dd className="text-text">{facility.permit_status}</dd>
                </div>
              )}
              {facility.capacity_notes && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold text-text-mid uppercase tracking-wide mb-1">
                    Capacity
                  </dt>
                  <dd className="text-text">{facility.capacity_notes}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Map */}
        {facility.lat && facility.lng && (
          <div className="mb-10">
            <h2 className="font-serif text-xl font-bold text-primary mb-3">
              Location
            </h2>
            <FacilityMapLazy
              center={{ lat: facility.lat, lng: facility.lng }}
              pins={[{ lat: facility.lat, lng: facility.lng, label: facility.name }]}
              height={320}
            />
          </div>
        )}

        {/* Navigation links */}
        <div className="mb-10 space-y-2">
          <Link
            href={`/${stateSlug}/${citySlug}`}
            className="block text-accent font-semibold hover:underline"
          >
            All facilities in {facility.city}, {facility.state_abbr} &rarr;
          </Link>
          {cityInfo?.county && cityInfo?.county_slug && (
            <Link
              href={`/${stateSlug}/county/${cityInfo.county_slug}`}
              className="block text-accent font-semibold hover:underline"
            >
              Facilities in {cityInfo.county}, {facility.state_abbr} &rarr;
            </Link>
          )}
          <Link
            href={`/${stateSlug}`}
            className="block text-accent font-semibold hover:underline"
          >
            Browse all facilities in {stateName} &rarr;
          </Link>
        </div>

        {/* Google reviews link */}
        {facility.google_maps_url && (
          <div className="mb-10">
            <a
              href={facility.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent font-semibold text-sm hover:underline"
            >
              Read reviews on Google Maps &rarr;
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
