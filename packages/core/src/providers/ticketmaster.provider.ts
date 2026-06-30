import type { EventProvider, EventQuery } from "../types/provider.js";
import type {
  EventStatus,
  NormalizedEvent,
  PriceRange,
  TicketStatus,
} from "../types/event.js";
import type { Venue } from "../types/venue.js";
import { toCountryCode } from "../util/country.js";
import { fetchJson, qs, RateLimiter, type FetchImpl } from "./http.js";

/**
 * Ticketmaster Discovery API — the primary event source (brief §4.1, B3).
 * Good European coverage, ticket links and venue coordinates included.
 * Free tier ≈ 5000 calls/day, ~2 req/s (rate-limited centrally per brief §5.2).
 */

const DEFAULT_BASE_URL = "https://app.ticketmaster.com/discovery/v2";

export interface TicketmasterProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
  rateLimiter?: RateLimiter;
  /** Returns the current time as ISO; injectable for deterministic tests. */
  now?: () => string;
}

// ── Raw response shapes (only the fields we read) ───────────────────────────
interface TmResponse {
  _embedded?: { events?: TmEvent[] };
}
interface TmEvent {
  id: string;
  name?: string;
  url?: string;
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string };
    timezone?: string;
    status?: { code?: string };
  };
  priceRanges?: { min?: number; max?: number; currency?: string }[];
  classifications?: {
    segment?: { name?: string };
    genre?: { name?: string };
    subType?: { name?: string };
    type?: { name?: string };
  }[];
  _embedded?: {
    venues?: TmVenue[];
    attractions?: { id?: string; name?: string }[];
  };
}
interface TmVenue {
  name?: string;
  city?: { name?: string };
  country?: { name?: string; countryCode?: string };
  address?: { line1?: string };
  location?: { latitude?: string; longitude?: string };
  timezone?: string;
}

export class TicketmasterProvider implements EventProvider {
  readonly name = "ticketmaster" as const;
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImpl;
  private readonly rateLimiter: RateLimiter;
  private readonly now: () => string;

  constructor(opts: TicketmasterProviderOptions = {}) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.rateLimiter = opts.rateLimiter ?? RateLimiter.perSecond(2);
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  async fetchEventsForArtist(query: EventQuery): Promise<NormalizedEvent[]> {
    if (!this.apiKey) return [];
    const attractionId = query.externalIds?.ticketmasterAttractionId;
    const url =
      `${this.baseUrl}/events.json` +
      qs({
        apikey: this.apiKey,
        attractionId,
        keyword: attractionId ? undefined : query.artistName,
        countryCode: query.countryCodes?.join(","),
        startDateTime: query.from ? `${query.from}T00:00:00Z` : undefined,
        size: query.size ?? 100,
        sort: "date,asc",
      });

    const data = await fetchJson<TmResponse>(url, {
      fetchImpl: this.fetchImpl,
      rateLimiter: this.rateLimiter,
    });
    const events = data._embedded?.events ?? [];
    return events
      .map((e) => this.normalize(e, query))
      .filter((e): e is NormalizedEvent => e !== null);
  }

  /** Normalize a raw TM event; returns null if it lacks a usable date. */
  normalize(e: TmEvent, query: EventQuery): NormalizedEvent | null {
    const date = e.dates?.start?.localDate;
    if (!date) return null;

    const rawVenue = e._embedded?.venues?.[0];
    const venue = normalizeVenue(rawVenue);
    const attractions = e._embedded?.attractions ?? [];
    const headliner = attractions[0]?.name ?? query.artistName;
    const supportActs = attractions.slice(1).map((a) => a.name ?? "").filter(Boolean);

    const { status, ticketStatus } = mapStatus(e.dates?.status?.code);
    const isFestival = looksLikeFestival(e);

    return {
      source: {
        provider: this.name,
        sourceId: e.id,
        url: e.url,
        ticketUrl: e.url,
        lastCheckedAt: this.now(),
      },
      artistMbid: query.mbid ?? query.externalIds?.mbid,
      artistName: headliner,
      supportActs,
      title: e.name,
      date,
      startTime: e.dates?.start?.localTime ? e.dates.start.localTime.slice(0, 5) : null,
      timezone: e.dates?.timezone ?? venue.timezone,
      venue,
      status,
      ticketStatus,
      priceRange: normalizePrice(e.priceRanges),
      isFestival,
      festivalName: isFestival ? e.name : undefined,
      rawPayload: e,
    };
  }
}

function normalizeVenue(v: TmVenue | undefined): Venue {
  if (!v) return { name: "Unknown venue" };
  const lat = v.location?.latitude ? Number(v.location.latitude) : undefined;
  const lng = v.location?.longitude ? Number(v.location.longitude) : undefined;
  const location =
    lat !== undefined && lng !== undefined && !Number.isNaN(lat) && !Number.isNaN(lng)
      ? { lat, lng }
      : undefined;
  return {
    name: v.name ?? "Unknown venue",
    city: v.city?.name,
    country: v.country?.name,
    countryCode: v.country?.countryCode ?? toCountryCode(v.country?.name),
    address: v.address?.line1,
    location,
    timezone: v.timezone,
  };
}

function normalizePrice(
  ranges: { min?: number; max?: number; currency?: string }[] | undefined,
): PriceRange | undefined {
  const r = ranges?.[0];
  if (!r) return undefined;
  return { min: r.min, max: r.max, currency: r.currency };
}

function mapStatus(code: string | undefined): {
  status: EventStatus;
  ticketStatus: TicketStatus;
} {
  switch (code) {
    case "onsale":
      return { status: "tickets_available", ticketStatus: "available" };
    case "offsale":
      return { status: "sold_out", ticketStatus: "sold_out" };
    case "cancelled":
      return { status: "cancelled", ticketStatus: "cancelled" };
    case "postponed":
    case "rescheduled":
      return { status: "rescheduled", ticketStatus: "unknown" };
    default:
      return { status: "announced", ticketStatus: "unknown" };
  }
}

function looksLikeFestival(e: TmEvent): boolean {
  const name = (e.name ?? "").toLowerCase();
  if (name.includes("festival")) return true;
  return (e.classifications ?? []).some((c) =>
    [c.type?.name, c.subType?.name].some((n) => (n ?? "").toLowerCase().includes("festival")),
  );
}
