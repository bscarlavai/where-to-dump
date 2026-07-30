"use client";

import { FACILITY_TYPE_LABELS } from "@/lib/constants/facility-types";
import type { FacilityType } from "@/types";

const ALL_FACILITY_TYPES = Object.keys(FACILITY_TYPE_LABELS) as FacilityType[];

interface Props {
  selected: FacilityType | null;
  onChange: (type: FacilityType | null) => void;
  counts?: Partial<Record<FacilityType, number>>;
  totalCount?: number;
}

export function TypeFilter({ selected, onChange, counts, totalCount }: Props) {
  // Sort types by count descending, only show ones with results
  const sorted = ALL_FACILITY_TYPES
    .filter((t) => !counts || (counts[t] && counts[t]! > 0))
    .sort((a, b) => (counts?.[b] ?? 0) - (counts?.[a] ?? 0));

  return (
    <div className="flex gap-2 overflow-x-auto sm:flex-wrap sm:overflow-visible pb-1">
      <button
        onClick={() => onChange(null)}
        className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold border-1.5 transition-colors ${
          selected === null
            ? "bg-primary text-white border-transparent"
            : "bg-primary-pale text-primary border-primary/10 hover:bg-primary/10"
        }`}
      >
        All
        {totalCount !== undefined && (
          <span className="ml-1 opacity-60">{totalCount}</span>
        )}
      </button>
      {sorted.map((type) => {
        const count = counts?.[type];
        return (
          <button
            key={type}
            onClick={() => onChange(selected === type ? null : type)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold border-1.5 transition-colors ${
              selected === type
                ? "bg-primary text-white border-transparent"
                : "bg-primary-pale text-primary border-primary/10 hover:bg-primary/10"
            }`}
          >
            {FACILITY_TYPE_LABELS[type]}
            {count !== undefined && (
              <span className="ml-1 opacity-60">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
