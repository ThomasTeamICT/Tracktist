import type {
  ArtistPriority as CoreArtistPriority,
  CanonicalEvent,
  EventStatus as CoreEventStatus,
  ProviderName as CoreProviderName,
  TicketStatus as CoreTicketStatus,
} from "@tracktist/core";
import type {
  ArtistPriority,
  EventStatus,
  NotifyMode,
  ProviderName,
  TicketStatus,
} from "@prisma/client";
import type { ArtistFollowRules } from "@tracktist/core";

/**
 * Bidirectional mapping between @tracktist/core's lowercase string unions and
 * the Prisma SCREAMING_CASE enums. Kept explicit so a new enum value can't
 * silently slip through.
 */

const EVENT_STATUS_TO_DB: Record<CoreEventStatus, EventStatus> = {
  announced: "ANNOUNCED",
  tickets_available: "TICKETS_AVAILABLE",
  sold_out: "SOLD_OUT",
  cancelled: "CANCELLED",
  rescheduled: "RESCHEDULED",
  past: "PAST",
};
const EVENT_STATUS_FROM_DB = invert(EVENT_STATUS_TO_DB);

const TICKET_STATUS_TO_DB: Record<CoreTicketStatus, TicketStatus> = {
  available: "AVAILABLE",
  presale: "PRESALE",
  sold_out: "SOLD_OUT",
  cancelled: "CANCELLED",
  unknown: "UNKNOWN",
};
const TICKET_STATUS_FROM_DB = invert(TICKET_STATUS_TO_DB);

const PROVIDER_TO_DB: Record<CoreProviderName, ProviderName> = {
  ticketmaster: "TICKETMASTER",
  bandsintown: "BANDSINTOWN",
  setlistfm: "SETLISTFM",
  manual: "MANUAL",
};
const PROVIDER_FROM_DB = invert(PROVIDER_TO_DB);

const PRIORITY_TO_DB: Record<CoreArtistPriority, ArtistPriority> = {
  low: "LOW",
  normal: "NORMAL",
  high: "HIGH",
  must_see: "MUST_SEE",
};
const PRIORITY_FROM_DB = invert(PRIORITY_TO_DB);

const NOTIFY_MODE_TO_DB: Record<ArtistFollowRules["mode"], NotifyMode> = {
  always: "ALWAYS",
  within_distance: "WITHIN_DISTANCE",
  only_countries: "ONLY_COUNTRIES",
  only_new_tours: "ONLY_NEW_TOURS",
  only_with_tickets: "ONLY_WITH_TICKETS",
  dashboard_only: "DASHBOARD_ONLY",
};
const NOTIFY_MODE_FROM_DB = invert(NOTIFY_MODE_TO_DB);

export const toDbEventStatus = (s: CoreEventStatus) => EVENT_STATUS_TO_DB[s];
export const fromDbEventStatus = (s: EventStatus) => EVENT_STATUS_FROM_DB[s];
export const toDbTicketStatus = (s: CoreTicketStatus) => TICKET_STATUS_TO_DB[s];
export const fromDbTicketStatus = (s: TicketStatus) => TICKET_STATUS_FROM_DB[s];
export const toDbProvider = (p: CoreProviderName) => PROVIDER_TO_DB[p];
export const fromDbProvider = (p: ProviderName) => PROVIDER_FROM_DB[p];
export const toDbPriority = (p: CoreArtistPriority) => PRIORITY_TO_DB[p];
export const fromDbPriority = (p: ArtistPriority) => PRIORITY_FROM_DB[p];
export const toDbNotifyMode = (m: ArtistFollowRules["mode"]) => NOTIFY_MODE_TO_DB[m];
export const fromDbNotifyMode = (m: NotifyMode) => NOTIFY_MODE_FROM_DB[m];

/** Convert an ISO `YYYY-MM-DD` string to a UTC midnight Date for `@db.Date`. */
export function isoDateToUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Convert a `@db.Date` back to an ISO `YYYY-MM-DD` string. */
export function utcToIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Reconstruct a core CanonicalEvent from the persisted relations. */
export interface DbEventWithRelations {
  id: string;
  dedupeKey: string;
  title: string | null;
  date: Date;
  startTime: string | null;
  timezone: string | null;
  status: EventStatus;
  ticketStatus: TicketStatus;
  priceMin: number | null;
  priceMax: number | null;
  priceCurrency: string | null;
  isFestival: boolean;
  festivalName: string | null;
  confidenceScore: number;
  firstSeenAt: Date;
  lastCheckedAt: Date;
  venue: {
    name: string;
    city: string | null;
    country: string | null;
    countryCode: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    timezone: string | null;
  };
  artists: {
    headliner: boolean;
    position: number;
    artist: { id: string; name: string; mbid: string | null; imageUrl?: string | null };
  }[];
  sources: {
    provider: ProviderName;
    sourceId: string;
    url: string | null;
    ticketUrl: string | null;
    lastCheckedAt: Date;
  }[];
}

export function dbEventToCanonical(e: DbEventWithRelations): CanonicalEvent {
  const headliner = e.artists.find((a) => a.headliner) ?? e.artists[0];
  const supportActs = e.artists
    .filter((a) => !a.headliner)
    .sort((a, b) => a.position - b.position)
    .map((a) => a.artist.name);

  return {
    id: e.dedupeKey,
    artistMbid: headliner?.artist.mbid ?? undefined,
    artistName: headliner?.artist.name ?? "Unknown",
    supportActs,
    title: e.title ?? undefined,
    date: utcToIsoDate(e.date),
    startTime: e.startTime,
    timezone: e.timezone ?? undefined,
    venue: {
      name: e.venue.name,
      city: e.venue.city ?? undefined,
      country: e.venue.country ?? undefined,
      countryCode: e.venue.countryCode ?? undefined,
      address: e.venue.address ?? undefined,
      location:
        e.venue.latitude !== null && e.venue.longitude !== null
          ? { lat: e.venue.latitude, lng: e.venue.longitude }
          : undefined,
      timezone: e.venue.timezone ?? undefined,
    },
    status: fromDbEventStatus(e.status),
    ticketStatus: fromDbTicketStatus(e.ticketStatus),
    priceRange:
      e.priceMin !== null || e.priceMax !== null
        ? {
            min: e.priceMin ?? undefined,
            max: e.priceMax ?? undefined,
            currency: e.priceCurrency ?? undefined,
          }
        : undefined,
    isFestival: e.isFestival,
    festivalName: e.festivalName ?? undefined,
    sources: e.sources.map((s) => ({
      provider: fromDbProvider(s.provider),
      sourceId: s.sourceId,
      url: s.url ?? undefined,
      ticketUrl: s.ticketUrl ?? undefined,
      lastCheckedAt: s.lastCheckedAt.toISOString(),
    })),
    confidenceScore: e.confidenceScore,
    firstSeenAt: e.firstSeenAt.toISOString(),
    lastCheckedAt: e.lastCheckedAt.toISOString(),
  };
}

/** The headliner artist's photo URL (or null) for a persisted event. */
export function headlinerImageUrl(e: DbEventWithRelations): string | null {
  const headliner = e.artists.find((a) => a.headliner) ?? e.artists[0];
  return headliner?.artist.imageUrl ?? null;
}

function invert<K extends string, V extends string>(rec: Record<K, V>): Record<V, K> {
  const out = {} as Record<V, K>;
  for (const k in rec) out[rec[k]] = k;
  return out;
}
