import Link from "next/link";
import { IconStar } from "@/components/icons";
import { FacilityImage } from "@/components/FacilityImage";
import type { FacilityCardData } from "@/types";
import { FACILITY_TYPE_LABELS } from "@/lib/constants/facility-types";

export function FacilityCard({ facility }: { facility: FacilityCardData }) {
  const href = `/${facility.state_slug}/${facility.city_slug}/${facility.slug}`;

  return (
    <Link href={href} className="block group h-full">
      <div className="bg-card border border-border rounded-2xl overflow-hidden transition-shadow group-hover:shadow-md h-full flex flex-col">
        {/* Image */}
        <div className="relative h-44">
          <FacilityImage src={facility.photo_url} cfImageId={facility.cf_image_id} variant="card" alt={facility.name} className="w-full h-full object-cover" />

          {/* Distance badge */}
          {facility.distance_miles != null && (
            <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-xs font-semibold text-primary px-2.5 py-1 rounded-lg shadow-sm z-10">
              {facility.distance_miles < 10 ? facility.distance_miles.toFixed(1) : Math.round(facility.distance_miles)} mi
            </div>
          )}

          {/* Rating badge */}
          {facility.google_rating && (
            <div className="absolute top-3 right-3 bg-white text-text text-xs font-semibold px-2.5 py-1 rounded-lg shadow-sm z-10">
              <IconStar className="w-3.5 h-3.5 text-accent inline-block" /> {facility.google_rating.toFixed(1)}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-4 flex-1">
          <h3 className="font-serif text-base font-bold text-primary mb-0.5 group-hover:text-accent transition-colors">
            {facility.name}
          </h3>
          <p className="text-sm text-text-mid mb-3">
            {facility.city}, {facility.state_abbr}
            {facility.google_review_count ? ` · ${facility.google_review_count.toLocaleString()} reviews` : ""}
          </p>

          {/* Type pills */}
          <div className="flex flex-wrap gap-1.5">
            <span className="tag-activity text-[11px] font-semibold px-2.5 py-1 rounded-full">
              {FACILITY_TYPE_LABELS[facility.facility_type]}
            </span>
            {facility.free_for_residents && (
              <span className="tag-produce text-[11px] font-semibold px-2.5 py-1 rounded-full">
                Free for residents
              </span>
            )}
            {facility.secondary_types.slice(0, 2).map((type) => (
              <span key={type} className="tag-amenity text-[11px] font-semibold px-2.5 py-1 rounded-full">
                {type}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}
