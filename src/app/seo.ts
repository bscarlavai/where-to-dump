/** Site URL helpers for canonical/OG metadata on public pages. */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://wheretodump.com").replace(/\/+$/, "");

export function siteUrl(): string {
  return SITE_URL;
}

/** Absolute canonical URL for a path like "/texas/houston". */
export function canonicalUrl(path: string): string {
  if (path === "/" || path === "") return `${SITE_URL}/`;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
