import type { ArtistExternalIds } from "../types/artist.js";
import type { CanonicalEvent, NormalizedEvent, ProviderName } from "../types/event.js";
import type { EventProvider } from "../types/provider.js";
import { dedupeEvents, DEFAULT_DEDUPE_OPTIONS, type DedupeOptions } from "../dedupe/dedupe.js";

/**
 * Artist-level monitoring pipeline (brief §5.5, steps 1–6 + 11).
 *
 * This is the SHARED work, deduplicated at artist level across all users
 * (brief §5.2): fetch events from every enabled provider (with per-provider
 * fallback), normalize, then dedupe into canonical events. Per-user distance,
 * relevance and notifications are computed separately ({@link evaluateEventsForUser}).
 */

export interface MonitorArtistInput {
  artist: {
    name: string;
    mbid?: string;
    externalIds: ArtistExternalIds;
  };
  providers: EventProvider[];
  from?: string;
  countryCodes?: string[];
  /** Injected "now" ISO for deterministic confidence/staleness. */
  now?: string;
  dedupeOptions?: Partial<DedupeOptions>;
}

export interface ProviderOutcome {
  provider: ProviderName;
  ok: boolean;
  count: number;
  error?: string;
}

export interface MonitorArtistResult {
  events: CanonicalEvent[];
  perProvider: ProviderOutcome[];
  /** Input external ids plus any backfilled from results (e.g. TM attraction id). */
  resolvedExternalIds: ArtistExternalIds;
}

export async function monitorArtist(input: MonitorArtistInput): Promise<MonitorArtistResult> {
  const now = input.now ?? new Date().toISOString();
  const dedupeOptions: DedupeOptions = { ...DEFAULT_DEDUPE_OPTIONS, ...input.dedupeOptions, now };

  const query = {
    artistName: input.artist.name,
    mbid: input.artist.mbid ?? input.artist.externalIds.mbid,
    externalIds: input.artist.externalIds,
    from: input.from,
    countryCodes: input.countryCodes,
  };

  const normalized: NormalizedEvent[] = [];
  const perProvider: ProviderOutcome[] = [];
  const resolvedExternalIds: ArtistExternalIds = { ...input.artist.externalIds };

  for (const provider of input.providers) {
    if (!provider.isEnabled()) {
      perProvider.push({ provider: provider.name, ok: true, count: 0 });
      continue;
    }
    try {
      const events = await provider.fetchEventsForArtist(query);
      normalized.push(...events);
      perProvider.push({ provider: provider.name, ok: true, count: events.length });
      backfillExternalIds(provider.name, events, resolvedExternalIds);
    } catch (err) {
      // Provider failure must not sink the whole sync (brief §5.2.7 fallback).
      perProvider.push({
        provider: provider.name,
        ok: false,
        count: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const events = dedupeEvents(normalized, dedupeOptions);
  return { events, perProvider, resolvedExternalIds };
}

/** Best-effort capture of provider-native ids so we can cache them (§4.3). */
function backfillExternalIds(
  provider: ProviderName,
  events: NormalizedEvent[],
  into: ArtistExternalIds,
): void {
  if (provider === "ticketmaster" && !into.ticketmasterAttractionId) {
    for (const e of events) {
      const id = extractTmAttractionId(e.rawPayload);
      if (id) {
        into.ticketmasterAttractionId = id;
        break;
      }
    }
  }
}

function extractTmAttractionId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const embedded = (raw as { _embedded?: { attractions?: { id?: string }[] } })._embedded;
  return embedded?.attractions?.[0]?.id;
}
