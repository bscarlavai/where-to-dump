import type { Metadata } from "next";
import { headers } from "next/headers";
import { getDb, parseJson } from "@/lib/db";
import { ReviewTable, type ReviewRow } from "./ReviewTable";

export const metadata: Metadata = {
  title: "Admin — Review Queue",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ status?: string; view?: string }>;
};

interface DbRow extends Omit<ReviewRow, "review_reasons"> {
  review_reasons: string;
}

const STATUSES = ["imported", "approved", "rejected"] as const;

export default async function AdminPage({ searchParams }: Props) {
  // Backstop for the CF Access edge gate (see src/lib/admin-auth.ts)
  if (process.env.NODE_ENV === "production") {
    const h = await headers();
    if (!h.get("cf-access-authenticated-user-email")) {
      return <p className="p-12 text-center text-text-mid">Unauthorized</p>;
    }
  }

  const params = await searchParams;
  const status = STATUSES.includes(params.status as (typeof STATUSES)[number])
    ? (params.status as string)
    : "imported";
  const needsReview = params.view !== "all";

  const db = (await getDb());
  const [countsResult, rowsResult] = await Promise.all([
    db
      .prepare(
        `SELECT status, COUNT(*) n, SUM(CASE WHEN review_score < 60 THEN 1 ELSE 0 END) flagged
         FROM facilities WHERE service_only = 0 GROUP BY status`
      )
      .all<{ status: string; n: number; flagged: number }>(),
    db
      .prepare(
        `SELECT id, name, slug, state_slug, city_slug, city, state_abbr, facility_type,
                google_primary_type, google_rating, google_review_count, google_maps_url,
                website, review_score, review_reasons, rejection_reason, admin_notes
         FROM facilities
         WHERE service_only = 0 AND status = ?1 ${needsReview ? "AND (review_score < 60 OR review_score IS NULL)" : ""}
         ORDER BY review_score ASC, google_review_count DESC
         LIMIT 500`
      )
      .bind(status)
      .all<DbRow>(),
  ]);

  const counts = Object.fromEntries(countsResult.results.map((r) => [r.status, r]));
  const rows: ReviewRow[] = rowsResult.results.map((r) => ({
    ...r,
    review_reasons: parseJson<string[]>(r.review_reasons, []),
  }));

  const tabClass = (active: boolean) =>
    `px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
      active ? "bg-primary text-white" : "bg-primary-pale text-primary hover:bg-primary hover:text-white"
    }`;

  return (
    <section className="px-4 py-10">
      <div className="max-w-6xl mx-auto">
        <h1 className="font-serif text-3xl font-bold text-primary mb-1">Review queue</h1>
        <p className="text-text-mid text-sm mb-6">
          Sorted worst-first by confidence score. Scripts score; only you approve or reject.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          {STATUSES.map((s) => (
            <a key={s} href={`/admin?status=${s}${needsReview ? "" : "&view=all"}`} className={tabClass(s === status)}>
              {s} {counts[s] ? `(${counts[s].n})` : "(0)"}
            </a>
          ))}
          <span className="mx-2 text-border">|</span>
          <a href={`/admin?status=${status}`} className={tabClass(needsReview)}>
            needs review {counts[status] ? `(${counts[status].flagged ?? 0})` : ""}
          </a>
          <a href={`/admin?status=${status}&view=all`} className={tabClass(!needsReview)}>
            all
          </a>
        </div>

        <ReviewTable rows={rows} />
      </div>
    </section>
  );
}
