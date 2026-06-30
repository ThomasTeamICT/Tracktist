/**
 * Geographic primitives. All coordinates are WGS84 (EPSG:4326) decimal
 * degrees, matching what Ticketmaster, Bandsintown and PostGIS use.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * A user "anchor": a place the user wants to be notified around. A user can
 * have several (home, work, a trip). Relevance is distance-based and crosses
 * borders by design (see brief §7).
 */
export interface Anchor {
  id?: string;
  label: string;
  location: GeoPoint;
  city?: string;
  country?: string;
  /** Notification radius in kilometres. */
  radiusKm: number;
  active: boolean;
  /** Optional validity window for temporary travel anchors (ISO dates). */
  startDate?: string;
  endDate?: string;
}

/** Standard radii (km) from brief §7 — all user-overridable. */
export const DEFAULT_RADII_KM = {
  local: 50,
  regional: 150,
  international: 300,
  mustSee: 500,
} as const;
