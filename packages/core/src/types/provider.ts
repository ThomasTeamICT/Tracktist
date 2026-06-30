import type { ArtistExternalIds } from "./artist.js";
import type { NormalizedEvent, ProviderName } from "./event.js";

/** Query passed to every {@link EventProvider}. */
export interface EventQuery {
  /** Headliner name (used as a fallback / for sources keyed on name). */
  artistName: string;
  /** Resolved external ids; providers should prefer their own id when present. */
  externalIds?: ArtistExternalIds;
  /** Optional MBID, propagated onto the returned normalized events. */
  mbid?: string;
  /** Only return events on/after this ISO date. */
  from?: string;
  /** Restrict to these ISO 3166-1 alpha-2 country codes. */
  countryCodes?: string[];
  /** Soft cap on number of results. */
  size?: number;
}

/**
 * The single seam every concert source sits behind (brief §4.1). Swapping or
 * adding a source must not touch the rest of the system. In v1 only
 * `ticketmaster` and `bandsintown` are active; `setlistfm` is context and
 * `manual` is an admin fallback.
 */
export interface EventProvider {
  readonly name: ProviderName;
  /** True when the provider has the config/keys it needs to run. */
  isEnabled(): boolean;
  /**
   * Fetch upcoming events for one artist and return them normalized to the
   * internal model. Implementations must be side-effect free and must not
   * throw on "no results" — return `[]`. Network/transport errors may throw
   * (the pipeline applies fallback per brief §5.2.7).
   */
  fetchEventsForArtist(query: EventQuery): Promise<NormalizedEvent[]>;
}
