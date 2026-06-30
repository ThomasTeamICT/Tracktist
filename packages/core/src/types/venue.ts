import type { GeoPoint } from "./geo.js";

/**
 * A concert venue. Coordinates come from the event providers where possible
 * (brief §4.4: geocoding stays out of the critical path); `location` is
 * therefore optional and only backfilled by the geocoding fallback for
 * manual/festival venues.
 */
export interface Venue {
  name: string;
  city?: string;
  /** Human-readable country name (e.g. "Netherlands"). */
  country?: string;
  /** ISO 3166-1 alpha-2 country code (e.g. "NL"), used for country filters. */
  countryCode?: string;
  address?: string;
  location?: GeoPoint;
  /** IANA timezone, e.g. "Europe/Amsterdam". */
  timezone?: string;
}
