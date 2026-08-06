// Fallback is committed on purpose: the hash is public (it's in every delivery
// URL) and the CI build machine has no .env.local — without this, CI builds
// silently hotlink Google photos sitewide (the LCP-spike incident of 2026-08-06).
const CLOUDFLARE_ACCOUNT_HASH =
  process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH || 'D-eKqFy3vQzSCwigzF9JpQ';

/**
 * Construct a Cloudflare Images delivery URL.
 * Variants (configured in Cloudflare dashboard):
 *   - detail: 1200x800 (facility detail hero)
 *   - card: 600x400 (facility cards in grids)
 *   - thumbnail: 300x300 (small previews, admin)
 *   - public: 1366x768 (original/full size)
 */
export type ImageVariant = 'detail' | 'card' | 'thumbnail' | 'public';

export function getCloudflareImageUrl(
  imageId: string,
  variant: ImageVariant = 'public'
): string {
  if (!CLOUDFLARE_ACCOUNT_HASH) {
    return '';
  }
  return `https://imagedelivery.net/${CLOUDFLARE_ACCOUNT_HASH}/${imageId}/${variant}`;
}

/**
 * Given a hero_image_url and optional cf_image_id, return the best URL.
 * Prefers Cloudflare Images when available, falls back to raw URL.
 */
export function getFacilityImageUrl(
  heroImageUrl: string | null,
  cfImageId: string | null,
  variant: ImageVariant = 'public'
): string | null {
  if (cfImageId && CLOUDFLARE_ACCOUNT_HASH) {
    return getCloudflareImageUrl(cfImageId, variant);
  }
  return heroImageUrl;
}
