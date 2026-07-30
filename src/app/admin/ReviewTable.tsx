"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FACILITY_TYPE_LABELS } from "@/lib/constants/facility-types";
import type { FacilityType } from "@/types";

export interface ReviewRow {
  id: number;
  name: string;
  slug: string;
  state_slug: string;
  city_slug: string;
  city: string | null;
  state_abbr: string;
  facility_type: FacilityType;
  google_primary_type: string | null;
  google_rating: number | null;
  google_review_count: number;
  google_maps_url: string | null;
  website: string | null;
  review_score: number | null;
  review_reasons: string[];
  rejection_reason: string | null;
}

function scoreColor(score: number | null): string {
  if (score == null) return "bg-primary-pale text-primary";
  if (score < 30) return "bg-red-pale text-red";
  if (score < 60) return "bg-accent-pale text-accent";
  return "bg-green-pale text-green";
}

export function ReviewTable({ rows }: { rows: ReviewRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  async function act(ids: number[], action: "approve" | "reject" | "reset") {
    setError(null);
    const res = await fetch("/api/admin/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? `Request failed (${res.status})`);
      return;
    }
    setSelected(new Set());
    startTransition(() => router.refresh());
  }

  if (rows.length === 0) {
    return (
      <p className="text-text-mid border border-border rounded-xl p-8 text-center">
        Nothing in this queue.
      </p>
    );
  }

  return (
    <div>
      {/* Bulk action bar */}
      <div className="flex items-center gap-3 mb-3 min-h-10">
        <label className="flex items-center gap-2 text-sm text-text-mid">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-[#FF6B1A]" />
          Select all ({rows.length})
        </label>
        {selected.size > 0 && (
          <>
            <span className="text-sm font-semibold text-primary">{selected.size} selected</span>
            <button
              onClick={() => act([...selected], "approve")}
              disabled={pending}
              className="bg-green text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => act([...selected], "reject")}
              disabled={pending}
              className="bg-red text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={() => act([...selected], "reset")}
              disabled={pending}
              className="border border-border text-text-mid text-sm font-semibold px-4 py-1.5 rounded-lg hover:border-primary disabled:opacity-50"
            >
              Reset to imported
            </button>
          </>
        )}
        {error && <span className="text-sm text-red font-medium">{error}</span>}
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className={`bg-card border rounded-xl p-4 flex gap-3 items-start ${
              selected.has(row.id) ? "border-accent" : "border-border"
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(row.id)}
              onChange={() => toggle(row.id)}
              className="mt-1.5 accent-[#FF6B1A]"
            />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${scoreColor(row.review_score)}`}>
                  {row.review_score ?? "?"}
                </span>
                <a
                  href={`/${row.state_slug}/${row.city_slug}/${row.slug}`}
                  target="_blank"
                  rel="noopener"
                  className="font-semibold text-primary hover:text-accent truncate"
                >
                  {row.name}
                </a>
                <span className="text-sm text-text-mid">
                  {row.city}, {row.state_abbr}
                </span>
                {row.facility_type === "unknown" ? (
                  <span className="text-xs bg-accent-pale text-accent px-2 py-0.5 rounded font-semibold">
                    Unclassified
                  </span>
                ) : (
                  <span className="text-xs bg-primary-pale text-primary px-2 py-0.5 rounded">
                    {FACILITY_TYPE_LABELS[row.facility_type] ?? row.facility_type}
                  </span>
                )}
                {row.google_primary_type && (
                  <span className="text-xs text-text-light">{row.google_primary_type}</span>
                )}
              </div>
              <div className="text-xs text-text-mid mt-1">
                {[
                  <span key="rating">
                    {row.google_rating ?? "–"}★ ({row.google_review_count})
                  </span>,
                  row.google_maps_url && (
                    <a key="maps" href={row.google_maps_url} target="_blank" rel="noopener" className="text-accent hover:underline">
                      Google Maps
                    </a>
                  ),
                  row.website && (
                    <a key="site" href={row.website} target="_blank" rel="noopener" className="text-accent hover:underline">
                      Website
                    </a>
                  ),
                  row.rejection_reason && (
                    <span key="rejected" className="text-red">Rejected: {row.rejection_reason}</span>
                  ),
                ]
                  .filter(Boolean)
                  .map((item, i) => (
                    <span key={i}>
                      {i > 0 && <span className="mx-1.5 text-text-light">·</span>}
                      {item}
                    </span>
                  ))}
              </div>
              {row.review_reasons.length > 0 && (
                <div className="text-xs text-text-light mt-1">{row.review_reasons.join(" · ")}</div>
              )}
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button
                onClick={() => act([row.id], "approve")}
                disabled={pending}
                className="text-green border border-green/30 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green hover:text-white disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => act([row.id], "reject")}
                disabled={pending}
                className="text-red border border-red/30 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red hover:text-white disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
