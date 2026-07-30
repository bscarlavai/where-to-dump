import { NextRequest, NextResponse } from "next/server";

/**
 * Simple in-memory sliding window rate limiter.
 * Tracks request counts per IP within a time window.
 *
 * Note: In-memory state resets on deploy/restart and isn't shared
 * across workers. This is a basic protection against casual abuse,
 * not a DDoS defense. For production at scale, use Cloudflare WAF
 * or an external rate limiting service.
 */

const windows = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windows) {
    if (entry.resetAt <= now) windows.delete(key);
  }
}, 60_000);

export function rateLimit(
  request: NextRequest,
  {
    maxRequests = 30,
    windowMs = 60_000,
  }: { maxRequests?: number; windowMs?: number } = {}
): NextResponse | null {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    "unknown";

  const key = `${ip}:${request.nextUrl.pathname}`;
  const now = Date.now();

  const entry = windows.get(key);

  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  entry.count++;

  if (entry.count > maxRequests) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)),
        },
      }
    );
  }

  return null;
}
