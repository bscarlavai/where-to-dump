import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

const ACTIONS: Record<string, string> = {
  approve: "approved",
  reject: "rejected",
  reset: "imported",
};

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  let body: { ids?: unknown; action?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const status = ACTIONS[String(body.action)];
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is number => Number.isInteger(id))
    : [];
  if (!status || ids.length === 0 || ids.length > 500) {
    return Response.json({ error: "Expected { ids: number[], action: approve|reject|reset }" }, { status: 400 });
  }

  const reason =
    status === "rejected" && typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 500)
      : null;

  try {
    const placeholders = ids.map((_, i) => `?${i + 3}`).join(",");
    const result = await (await getDb())
      .prepare(
        `UPDATE facilities
         SET status = ?1,
             rejection_reason = ?2,
             updated_at = datetime('now')
         WHERE id IN (${placeholders})`
      )
      .bind(status, reason, ...ids)
      .run();

    return Response.json({ updated: result.meta.changes ?? ids.length, status });
  } catch (err) {
    console.error("Admin review error:", err);
    return Response.json({ error: "Update failed" }, { status: 500 });
  }
}
