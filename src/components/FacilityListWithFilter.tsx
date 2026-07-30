"use client";

import { useState, useMemo } from "react";
import { TypeFilter } from "@/components/TypeFilter";
import { FacilityCard } from "@/components/FacilityCard";
import { MATERIAL_LABELS } from "@/lib/constants/facility-types";
import type { FacilityType, FacilityCardData } from "@/types";

interface Props {
  facilities: FacilityCardData[];
}

export function FacilityListWithFilter({ facilities }: Props) {
  const [selectedType, setSelectedType] = useState<FacilityType | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map: Partial<Record<FacilityType, number>> = {};
    for (const facility of facilities) {
      map[facility.facility_type] = (map[facility.facility_type] || 0) + 1;
    }
    return map;
  }, [facilities]);

  const materialCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const facility of facilities) {
      for (const m of facility.accepted_materials ?? []) {
        if (MATERIAL_LABELS[m]) map[m] = (map[m] || 0) + 1;
      }
    }
    return map;
  }, [facilities]);
  const activeMaterials = Object.keys(MATERIAL_LABELS).filter((m) => materialCounts[m]);

  const filtered = facilities.filter(
    (f) =>
      (!selectedType || f.facility_type === selectedType) &&
      (!selectedMaterial || (f.accepted_materials ?? []).includes(selectedMaterial))
  );

  return (
    <>
      <div className="mb-4">
        <TypeFilter
          selected={selectedType}
          onChange={setSelectedType}
          counts={counts}
          totalCount={facilities.length}
        />
      </div>

      {/* Accepted-materials filter (facilities with scraped materials only) */}
      {activeMaterials.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-light mr-1">
            Accepts
          </span>
          {activeMaterials.map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMaterial(selectedMaterial === m ? null : m)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                selectedMaterial === m
                  ? "bg-primary text-white border-primary"
                  : "bg-card text-text-mid border-border hover:border-primary hover:text-primary"
              }`}
            >
              {MATERIAL_LABELS[m]}
              <span className="ml-1 opacity-60">{materialCounts[m]}</span>
            </button>
          ))}
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {filtered.map((facility) => (
            <FacilityCard key={facility.id ?? facility.slug} facility={facility} />
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <p className="text-text-mid">
            No facilities found matching this filter. Try a different combination.
          </p>
        </div>
      )}
    </>
  );
}
