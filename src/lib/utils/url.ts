const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|msclkid$|mc_cid$|mc_eid$)/i;

/**
 * Clean a business website URL from Google/Outscraper data.
 *
 * Owners paste GBP links with attribution tags, and Google hands them to us
 * percent-encoded ("...%3Futm_source%3Dgbp%26utm_medium%3Dorganic"). Decode
 * that layer, strip tracking params, and keep everything else intact.
 */
export function cleanWebsiteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let raw = url.trim();
  if (!raw) return null;

  // Undo the encoded-query layer if present (%3F=?, %3D==, %26=&)
  if (/%3F|%3D|%26/i.test(raw)) {
    try {
      raw = decodeURIComponent(raw);
    } catch {
      // malformed escape — leave as-is
    }
  }

  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) parsed.searchParams.delete(key);
    }
    let out = parsed.toString();
    if (out.endsWith("?")) out = out.slice(0, -1);
    return out;
  } catch {
    return raw;
  }
}
