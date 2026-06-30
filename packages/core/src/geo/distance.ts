import type { Anchor, GeoPoint } from "../types/geo.js";
import type { CanonicalEvent } from "../types/event.js";

const EARTH_RADIUS_KM = 6371.0088; // mean Earth radius (IUGG)

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle (Haversine) distance in kilometres between two WGS84 points.
 * This is the v1 distance metric (brief §7); road distance / travel time is v2.
 *
 * Borders are irrelevant to the maths — a point in NL and a point in BE are
 * compared the same way as two points in the same country.
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

/** True when `point` lies within `radiusKm` of `anchor` (border-agnostic). */
export function isWithinRadius(
  anchor: Anchor,
  point: GeoPoint,
  radiusKm: number = anchor.radiusKm,
): boolean {
  return haversineKm(anchor.location, point) <= radiusKm;
}

export interface DistanceResult {
  anchorId?: string;
  anchorLabel: string;
  distanceKm: number;
  withinRadius: boolean;
}

/** Rounds to one decimal — plenty for display and idempotency keys. */
export function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}

/**
 * Distance + within-radius for a single (anchor, point) pair. Returns `null`
 * when the point has no coordinates, so callers can flag missing geodata
 * rather than silently treating it as "far away".
 */
export function distanceForPoint(
  anchor: Anchor,
  point: GeoPoint | undefined,
): DistanceResult | null {
  if (!point) return null;
  const distanceKm = roundKm(haversineKm(anchor.location, point));
  return {
    anchorId: anchor.id,
    anchorLabel: anchor.label,
    distanceKm,
    withinRadius: distanceKm <= anchor.radiusKm,
  };
}

/**
 * Distance of a canonical event from every active anchor. Inactive anchors and
 * anchors outside their validity window (for the event date) are skipped. The
 * closest qualifying anchor comes first.
 */
export function distancesForEvent(
  event: Pick<CanonicalEvent, "venue" | "date">,
  anchors: Anchor[],
): DistanceResult[] {
  const point = event.venue.location;
  if (!point) return [];

  return anchors
    .filter((a) => a.active && anchorAppliesOn(a, event.date))
    .map((a) => distanceForPoint(a, point))
    .filter((r): r is DistanceResult => r !== null)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Is the anchor valid on the given ISO date? Open-ended bounds are allowed. */
export function anchorAppliesOn(anchor: Anchor, isoDate: string): boolean {
  if (anchor.startDate && isoDate < anchor.startDate) return false;
  if (anchor.endDate && isoDate > anchor.endDate) return false;
  return true;
}

/** Closest within-radius distance across anchors, or null if none qualify. */
export function bestWithinRadius(
  event: Pick<CanonicalEvent, "venue" | "date">,
  anchors: Anchor[],
): DistanceResult | null {
  const within = distancesForEvent(event, anchors).filter((d) => d.withinRadius);
  return within[0] ?? null;
}
