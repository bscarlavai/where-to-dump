/**
 * Site reviews are not part of v1 (no reviews table in D1 yet — see
 * db/schema.sql). Facility pages show Google ratings only. This stub keeps the
 * import surface stable for when reviews return.
 */

export async function getReviewsByFacility(_facilityId: number) {
  return [] as never[];
}
