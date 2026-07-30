/** Single shared haversine (miles). Replaces the four copies in the fork. */
export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Bounding box deltas for a radius pre-filter. */
export function bboxDeltas(centerLat: number, radiusMiles: number) {
  return {
    latDelta: radiusMiles / 69,
    lngDelta: radiusMiles / (69 * Math.cos((centerLat * Math.PI) / 180)),
  };
}
