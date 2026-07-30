"use client";

import { useState, useMemo } from "react";
import { TypeFilter } from "@/components/TypeFilter";
import { FacilityCard } from "@/components/FacilityCard";
import type { FacilityType, FacilityCardData } from "@/types";

interface Props {
  facilities: FacilityCardData[];
}

export function FacilityListWithFilter({ facilities }: Props) {
  const [selectedType, setSelectedType] = useState<FacilityType | null>(null);

  const counts = useMemo(() => {
    const map: Partial<Record<FacilityType, number>> = {};
    for (const facility of facilities) {
      map[facility.facility_type] = (map[facility.facility_type] || 0) + 1;
    }
    return map;
  }, [facilities]);

  const filtered = selectedType
    ? facilities.filter((f) => f.facility_type === selectedType)
    : facilities;

  return (
    <>
      <div className="mb-6">
        <TypeFilter
          selected={selectedType}
          onChange={setSelectedType}
          counts={counts}
          totalCount={facilities.length}
        />
      </div>

      {filtered.length > 0 ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {filtered.map((facility) => (
            <FacilityCard key={facility.id ?? facility.slug} facility={facility} />
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <p className="text-text-mid">
            No facilities found matching this filter. Try a different type.
          </p>
        </div>
      )}
    </>
  );
}
