import type { Location } from "../types.js";

const EARTH_RADIUS_M = 6_371_000;

/**
 * Great-circle distance between two WGS84 points, in meters.
 *
 * We use the haversine formula — plenty accurate for the scale we care
 * about (sub-km radii within a single city) and avoids pulling in a
 * geo dependency. Not suitable for antipodal precision, which we
 * intentionally don't need.
 */
export function haversineMeters(a: Location, b: Location): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
