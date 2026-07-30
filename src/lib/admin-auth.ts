import type { NextRequest } from "next/server";

/**
 * Admin gate. In production, Cloudflare Access must sit in front of /admin
 * and /api/admin (configure an Access application for wheretodump.com/admin*
 * before deploy); Access injects Cf-Access-Authenticated-User-Email after its
 * own JWT check, and Workers behind Access never see unauthenticated traffic.
 * This check is a belt-and-suspenders backstop so the routes fail closed if
 * the Access application is missing or misconfigured. Local dev is open.
 */
export function requireAdmin(request: NextRequest): Response | null {
  if (process.env.NODE_ENV !== "production") return null;
  if (request.headers.get("cf-access-authenticated-user-email")) return null;
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
