import type { EventProvider, EventQuery } from "../types/provider.js";
import type {
  EventStatus,
  NormalizedEvent,
  TicketStatus,
} from "../types/event.js";
import type { Venue } from "../types/venue.js";
import { toCountryCode } from "../util/country.js";
import { normalizeName, similarity } from "../util/text.js";
import { fetchJson, qs, RateLimiter, type FetchImpl } from "./http.js";

/**
 * Bandsintown Public API — the secondary event source (brief §4.1, B3).
 * Read-only artist/event endpoints with a self-chosen `app_id`; strong for
 * touring/indie acts and festivals, usually with coordinates.
 */

const DEFAULT_BASE_URL = "https://rest.bandsintown.com";

export interface BandsintownProviderOptions {
  appId?: string;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
  rateLimiter?: RateLimiter;
  now?: () => string;
}

interface BitEvent {
  id: string;
  url?: string;
  datetime?: string; // local ISO, no timezone offset
  title?: string;
  description?: string;
  lineup?: string[];
  venue?: {
    name?: string;
    city?: string;
    region?: string;
    country?: string;
    latitude?: string | number;
    longitude?: string | number;
  };
  offers?: { type?: string; url?: string; status?: string }[];
  festival_start_date?: string;
}

export class BandsintownProvider implements EventProvider {
  readonly name = "bandsintown" as const;
  private readonly appId?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImpl;
  private readonly rateLimiter: RateLimiter;
  private readonly now: () => string;

  constructor(opts: BandsintownProviderOptions = {}) {
    this.appId = opts.appId;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.rateLimiter = opts.rateLimiter ?? RateLimiter.perSecond(2);
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  isEnabled(): boolean {
    return Boolean(this.appId);
  }

  async fetchEventsForArtist(query: EventQuery): Promise<NormalizedEvent[]> {
    if (!this.appId) return [];
    const artist = query.externalIds?.bandsintownId ?? query.artistName;
    // Bandsintown wants "/", "?" and "*" in artist names double-encoded.
    const path = encodeURIComponent(artist)
      .replace(/%2F/gi, "%252F")
      .replace(/%3F/gi, "%253F")
      .replace(/\*/g, "%252A");
    const url =
      `${this.baseUrl}/artists/${path}/events` +
      qs({ app_id: this.appId, date: "upcoming" });

    const data = await fetchJson<BitEvent[] | { errorMessage?: string }>(url, {
      fetchImpl: this.fetchImpl,
      rateLimiter: this.rateLimiter,
    });
    // Bandsintown returns an object with errorMessage on unknown artist.
    if (!Array.isArray(data)) return [];

    let events = data
      .map((e) => this.normalize(e, query))
      .filter((e): e is NormalizedEvent => e !== null);

    if (query.from) events = events.filter((e) => e.date >= query.from!);
    if (query.countryCodes?.length) {
      const set = new Set(query.countryCodes.map((c) => c.toUpperCase()));
      events = events.filter((e) => e.venue.countryCode && set.has(e.venue.countryCode));
    }
    return events;
  }

  normalize(e: BitEvent, query: EventQuery): NormalizedEvent | null {
    if (!e.datetime) return null;
    const date = e.datetime.slice(0, 10);
    const time = e.datetime.length >= 16 ? e.datetime.slice(11, 16) : null;

    const venue = normalizeVenue(e.venue);
    const lineup = (e.lineup ?? []).filter(Boolean);
    const headliner = lineup[0] ?? query.artistName;
    const supportActs = lineup.slice(1);
    // Same rule as Ticketmaster: the MBID belongs to the queried artist, so
    // only stamp it when they are actually the headliner of this bill. These
    // events come from the artist's OWN endpoint, so a bill without other
    // acts is theirs even when the name is stylized ("MØ" vs "MO").
    const na = normalizeName(headliner);
    const nb = normalizeName(query.artistName);
    const headlinerIsQueryArtist = na === nb || similarity(na, nb) >= 0.85 || lineup.length <= 1;

    const { status, ticketStatus, ticketUrl } = mapOffers(e.offers);
    const isFestival = Boolean(e.festival_start_date) ||
      (e.title ?? "").toLowerCase().includes("festival");

    return {
      source: {
        provider: this.name,
        sourceId: e.id,
        url: e.url,
        ticketUrl: ticketUrl ?? e.url,
        lastCheckedAt: this.now(),
      },
      artistMbid: headlinerIsQueryArtist ? query.mbid ?? query.externalIds?.mbid : undefined,
      artistName: headliner,
      supportActs,
      title: e.title || undefined,
      date,
      startTime: time,
      timezone: undefined, // Bandsintown gives local time without IANA zone
      venue,
      status,
      ticketStatus,
      isFestival,
      festivalName: isFestival ? e.title || undefined : undefined,
      rawPayload: e,
    };
  }
}

function normalizeVenue(v: BitEvent["venue"]): Venue {
  if (!v) return { name: "Unknown venue" };
  const lat = v.latitude !== undefined ? Number(v.latitude) : undefined;
  const lng = v.longitude !== undefined ? Number(v.longitude) : undefined;
  const location =
    lat !== undefined && lng !== undefined && !Number.isNaN(lat) && !Number.isNaN(lng) && (lat !== 0 || lng !== 0)
      ? { lat, lng }
      : undefined;
  return {
    name: v.name ?? "Unknown venue",
    city: v.city,
    country: v.country,
    countryCode: toCountryCode(v.country),
    location,
  };
}

function mapOffers(offers: BitEvent["offers"]): {
  status: EventStatus;
  ticketStatus: TicketStatus;
  ticketUrl?: string;
} {
  const ticket = (offers ?? []).find(
    (o) => (o.type ?? "").toLowerCase() === "tickets",
  );
  if (!ticket) return { status: "announced", ticketStatus: "unknown" };
  const s = (ticket.status ?? "").toLowerCase();
  if (s === "available") {
    return { status: "tickets_available", ticketStatus: "available", ticketUrl: ticket.url };
  }
  if (s.includes("sold")) {
    return { status: "sold_out", ticketStatus: "sold_out", ticketUrl: ticket.url };
  }
  return { status: "announced", ticketStatus: "unknown", ticketUrl: ticket.url };
}
