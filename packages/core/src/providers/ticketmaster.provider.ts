import type { EventProvider, EventQuery } from "../types/provider.js";
import type {
  EventStatus,
  NormalizedEvent,
  PriceRange,
  TicketStatus,
} from "../types/event.js";
import type { Venue } from "../types/venue.js";
import { toCountryCode } from "../util/country.js";
import { normalizeName, similarity } from "../util/text.js";
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
  page?: { totalPages?: number; number?: number };
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
    const byKeyword = !attractionId;

    // Follow pagination — big tours span multiple pages. Capped defensively;
    // the Discovery API itself refuses size×page beyond 1000 items.
    const MAX_PAGES = 5;
    const raw: TmEvent[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const url =
        `${this.baseUrl}/events.json` +
        qs({
          apikey: this.apiKey,
          attractionId,
          keyword: byKeyword ? query.artistName : undefined,
          countryCode: query.countryCodes?.join(","),
          startDateTime: query.from ? `${query.from}T00:00:00Z` : undefined,
          size: query.size ?? 100,
          page: page > 0 ? page : undefined,
          sort: "date,asc",
        });
      const data = await fetchJson<TmResponse>(url, {
        fetchImpl: this.fetchImpl,
        rateLimiter: this.rateLimiter,
      });
      raw.push(...(data._embedded?.events ?? []));
      const totalPages = data.page?.totalPages ?? 1;
      if (page + 1 >= totalPages) break;
    }

    return raw
      // Keyword search is fuzzy (matches event names, similar artists…);
      // only keep events verifiably featuring the queried artist.
      .filter((e) => !byKeyword || eventFeaturesArtist(e, query.artistName))
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
    // Only stamp the queried artist's MBID when they actually ARE the
    // headliner — on a multi-act bill where they support, the event belongs
    // to the headliner and a wrong MBID would poison dedupe.
    const headlinerIsQueryArtist = sameName(headliner, query.artistName);

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
      artistMbid: headlinerIsQueryArtist ? query.mbid ?? query.externalIds?.mbid : undefined,
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

/** True when two artist names refer to the same act (normalized/fuzzy). */
function sameName(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na === nb || similarity(na, nb) >= 0.85;
}

/** Does this raw TM event verifiably feature the queried artist? */
function eventFeaturesArtist(e: TmEvent, artistName: string): boolean {
  const attractions = e._embedded?.attractions ?? [];
  if (attractions.length > 0) {
    return attractions.some((a) => a.name && sameName(a.name, artistName));
  }
  // No attraction list — fall back to the event name containing the artist.
  const eventName = normalizeName(e.name ?? "");
  const artist = normalizeName(artistName);
  return artist.length > 0 && eventName.includes(artist);
}

function mapStatus(code: string | undefined): {
  status: EventStatus;
  ticketStatus: TicketStatus;
} {
  switch (code) {
    case "onsale":
      return { status: "tickets_available", ticketStatus: "available" };
    case "offsale":
      // "offsale" only means "not currently on sale" — before the sale opens
      // OR after it closed. Calling that "sold out" would be a lie; keep it
      // announced/unknown and let other sources refine it.
      return { status: "announced", ticketStatus: "unknown" };
    case "cancelled":
    case "canceled": // TM uses the US spelling in parts of the Discovery API
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
