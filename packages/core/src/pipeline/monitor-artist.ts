import type { ArtistExternalIds } from "../types/artist.js";
import type { CanonicalEvent, NormalizedEvent, ProviderName } from "../types/event.js";
import type { EventProvider } from "../types/provider.js";
import { dedupeEvents, DEFAULT_DEDUPE_OPTIONS, type DedupeOptions } from "../dedupe/dedupe.js";
import { normalizeName, similarity } from "../util/text.js";

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

  // Fetch providers concurrently — each has its own rate limiter, so sync
  // latency is the slowest provider, not the sum of all of them.
  const outcomes = await Promise.all(
    input.providers.map(async (provider) => {
      if (!provider.isEnabled()) {
        return { provider, events: [] as NormalizedEvent[], outcome: { provider: provider.name, ok: true, count: 0 } };
      }
      try {
        const events = await provider.fetchEventsForArtist(query);
        return { provider, events, outcome: { provider: provider.name, ok: true, count: events.length } };
      } catch (err) {
        // Provider failure must not sink the whole sync (brief §5.2.7 fallback).
        return {
          provider,
          events: [] as NormalizedEvent[],
          outcome: {
            provider: provider.name,
            ok: false,
            count: 0,
            error: err instanceof Error ? err.message : String(err),
          },
        };
      }
    }),
  );
  for (const { provider, events, outcome } of outcomes) {
    normalized.push(...events);
    perProvider.push(outcome);
    if (outcome.ok && events.length > 0) {
      backfillExternalIds(provider.name, events, resolvedExternalIds, input.artist.name);
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
  artistName: string,
): void {
  if (provider === "ticketmaster" && !into.ticketmasterAttractionId) {
    for (const e of events) {
      const id = extractTmAttractionId(e.rawPayload, artistName);
      if (id) {
        into.ticketmasterAttractionId = id;
        break;
      }
    }
  }
}

/**
 * The attraction id of the attraction whose NAME matches the queried artist —
 * never blindly the first one, or a fuzzy keyword hit would permanently cache
 * another act's id (§4.3: resolve once, so a wrong cache is sticky).
 */
function extractTmAttractionId(raw: unknown, artistName: string): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const embedded = (raw as { _embedded?: { attractions?: { id?: string; name?: string }[] } })
    ._embedded;
  const target = normalizeName(artistName);
  for (const a of embedded?.attractions ?? []) {
    if (!a.id || !a.name) continue;
    const name = normalizeName(a.name);
    if (name === target || similarity(name, target) >= 0.9) return a.id;
  }
  return undefined;
}
