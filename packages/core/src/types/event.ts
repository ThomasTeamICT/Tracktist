import type { Venue } from "./venue.js";

/** Event lifecycle status (brief §5.1). */
export type EventStatus =
  | "announced"
  | "tickets_available"
  | "sold_out"
  | "cancelled"
  | "rescheduled"
  | "past";

/** Ticket availability, surfaced separately from lifecycle status. */
export type TicketStatus =
  | "available"
  | "presale"
  | "sold_out"
  | "cancelled"
  | "unknown";

/** Identifiers of the providers active in v1 + context/fallback sources. */
export type ProviderName =
  | "ticketmaster"
  | "bandsintown"
  | "setlistfm"
  | "manual";

export interface PriceRange {
  min?: number;
  max?: number;
  currency?: string;
}

/** A reference to one source that reported a (possibly shared) event. */
export interface EventSourceRef {
  provider: ProviderName;
  /** Identifier within that provider. */
  sourceId: string;
  /** Event page URL at the source. */
  url?: string;
  /** Raw (pre-affiliate) ticket link from the source. */
  ticketUrl?: string;
  /** ISO timestamp when this source was last checked. */
  lastCheckedAt: string;
}

/**
 * A single provider's view of an event, normalized to the internal model but
 * NOT yet deduplicated. One per (provider, source event).
 */
export interface NormalizedEvent {
  source: EventSourceRef;
  /** MBID of the headliner if the caller resolved it; else undefined. */
  artistMbid?: string;
  /** Headliner name as reported by the source. */
  artistName: string;
  supportActs: string[];
  title?: string;
  /** Local calendar date at the venue, ISO `YYYY-MM-DD`. */
  date: string;
  /** Local start time `HH:mm` if known, else null. */
  startTime?: string | null;
  timezone?: string;
  venue: Venue;
  status: EventStatus;
  ticketStatus: TicketStatus;
  priceRange?: PriceRange;
  isFestival: boolean;
  festivalName?: string;
  /** Raw payload kept for debugging; never exposed to clients. */
  rawPayload?: unknown;
}

/**
 * The canonical, deduplicated event merged across sources (brief §5.3).
 * Multiple {@link NormalizedEvent}s describing the same show collapse into one
 * of these.
 */
export interface CanonicalEvent {
  id: string;
  artistMbid?: string;
  artistName: string;
  supportActs: string[];
  title?: string;
  date: string;
  startTime?: string | null;
  timezone?: string;
  venue: Venue;
  status: EventStatus;
  ticketStatus: TicketStatus;
  priceRange?: PriceRange;
  isFestival: boolean;
  festivalName?: string;
  /** Every source that confirmed this event. */
  sources: EventSourceRef[];
  /** 0.0–1.0 (brief §5.4). */
  confidenceScore: number;
  /** ISO timestamps. */
  firstSeenAt: string;
  lastCheckedAt: string;
}
