import "server-only";
import {
  monitorArtist,
  normalizeName,
  similarity,
  venueSimilarity,
  type ArtistExternalIds,
  type CanonicalEvent,
  type Venue as CoreVenue,
} from "@tracktist/core";
import type { ArtistExternalId, ExternalSource } from "@prisma/client";
import { prisma } from "./prisma.js";
import { buildEventProviders } from "./integrations.js";
import { isoDateToUtc, toDbEventStatus, toDbProvider, toDbTicketStatus } from "./mappers.js";

/**
 * Server-side artist sync (brief §5.2, §5.5). Runs the shared, artist-level
 * pipeline and persists the result idempotently: events upsert on `dedupeKey`,
 * sources on `(provider, sourceId)`, so re-running never duplicates data.
 */
export async function syncArtist(
  artistId: string,
  opts: { from?: string } = {},
): Promise<{ eventCount: number }> {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    include: { externalIds: true },
  });
  if (!artist) throw new Error(`Artist ${artistId} not found`);

  const from = opts.from ?? new Date().toISOString().slice(0, 10);
  const providers = buildEventProviders();

  const result = await monitorArtist({
    artist: {
      name: artist.name,
      mbid: artist.mbid ?? undefined,
      externalIds: mapExternalIds(artist.externalIds, artist.mbid),
    },
    providers,
    from,
  });

  // `claimed` prevents two canonical events in this batch from re-attaching
  // to the SAME DB row (a split residency would otherwise collapse back onto
  // one row and flip-flop between nights every sync).
  const claimed = new Set<string>();
  let persisted = 0;
  let persistFailures = 0;
  for (const event of result.events) {
    try {
      await persistCanonicalEvent({ id: artist.id, name: artist.name }, event, claimed);
      persisted++;
    } catch (err) {
      // One poisoned event must not abort the artist's whole sync (and leave
      // lastSyncedAt unset, wedging this artist at the head of every tick).
      persistFailures++;
      console.error(`persist failed for event ${event.id}`, err);
    }
  }

  // Ghost-show decay: future events of this artist that a live sync no longer
  // returns slowly lose confidence, so a silently removed listing fades to
  // "nog niet bevestigd" instead of haunting agendas forever. Strictly gated:
  // EVERY configured provider must have answered OK (a disabled provider says
  // nothing about the world, and a failing one would license decaying the
  // very events it exclusively sources), and no persist may have failed
  // (a failed persist leaves the old row keyed differently → false ghost).
  const liveOutcomes = result.perProvider.filter((p) => p.enabled);
  const allLiveProvidersOk = liveOutcomes.length > 0 && liveOutcomes.every((p) => p.ok);
  if (allLiveProvidersOk && persistFailures === 0) {
    const seenKeys = result.events.map((e) => e.id);
    await prisma.event.updateMany({
      where: {
        date: { gte: isoDateToUtc(from) },
        dedupeKey: { notIn: seenKeys },
        artists: { some: { artistId: artist.id } },
        confidenceScore: { gt: 0 },
        // Manual events are curated on purpose — never decay them.
        sources: { none: { provider: "MANUAL" } },
      },
      data: { confidenceScore: { decrement: 0.15 } },
    });
    await prisma.event.updateMany({
      where: { confidenceScore: { lt: 0 } },
      data: { confidenceScore: 0 },
    });
  }

  // Cache the Ticketmaster attraction id we discovered (resolve once — §4.3).
  const tmId = result.resolvedExternalIds.ticketmasterAttractionId;
  if (tmId && !artist.externalIds.some((e) => e.source === "TICKETMASTER")) {
    await prisma.artistExternalId
      .create({ data: { artistId: artist.id, source: "TICKETMASTER", externalId: tmId } })
      .catch(() => undefined); // ignore unique races
  }

  await prisma.artist.update({ where: { id: artist.id }, data: { lastSyncedAt: new Date() } });

  for (const p of result.perProvider) {
    await prisma.providerSyncLog.create({
      data: {
        provider: toDbProvider(p.provider),
        artistId: artist.id,
        ok: p.ok,
        eventCount: p.count,
        error: p.error ?? null,
        finishedAt: new Date(),
      },
    });
  }

  return { eventCount: persisted };
}

/** Persist a batch of canonical events for an artist (worker/tests reuse this). */
export async function persistArtistEvents(
  headlinerArtistId: string,
  events: CanonicalEvent[],
): Promise<void> {
  const artist = await prisma.artist.findUnique({
    where: { id: headlinerArtistId },
    select: { id: true, name: true },
  });
  if (!artist) throw new Error(`Artist ${headlinerArtistId} not found`);
  const claimed = new Set<string>();
  for (const ev of events) await persistCanonicalEvent(artist, ev, claimed);
}

async function persistCanonicalEvent(
  syncedArtist: { id: string; name: string },
  ev: CanonicalEvent,
  claimed: Set<string> = new Set(),
): Promise<void> {
  const venue = await getOrCreateVenue(ev.venue);

  const common = {
    title: ev.title ?? null,
    date: isoDateToUtc(ev.date),
    startTime: ev.startTime ?? null,
    timezone: ev.timezone ?? null,
    supportActs: ev.supportActs,
    venueId: venue.id,
    status: toDbEventStatus(ev.status),
    ticketStatus: toDbTicketStatus(ev.ticketStatus),
    priceMin: ev.priceRange?.min ?? null,
    priceMax: ev.priceRange?.max ?? null,
    priceCurrency: ev.priceRange?.currency ?? null,
    isFestival: ev.isFestival,
    festivalName: ev.festivalName ?? null,
    confidenceScore: ev.confidenceScore,
    lastCheckedAt: new Date(ev.lastCheckedAt),
  };

  // The canonical key can drift: a cluster gains/loses a source (different
  // representative venue spelling, late MBID) or the show is RESCHEDULED to a
  // new date. Before creating a "new" event, re-attach to the existing row —
  // first via the strongest anchor (a shared provider sourceId), then via
  // same-artist/same-day venue similarity. Otherwise every drift or
  // reschedule would duplicate the show and orphan the old row.
  //
  // Two guards keep re-attachment honest:
  // - `claimed`: a row already matched by another canonical event in THIS
  //   batch is off-limits (split residency nights must not collapse back).
  // - key downgrades: an MBID-keyed row never adopts a name-keyed id — a
  //   co-billed follower's sync sees the same show without the headliner's
  //   MBID and would otherwise flip the key back and forth every sync,
  //   re-triggering notifications for all followers.
  const keyHasMbid = (key: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(key);
  const mayRekey = (currentKey: string) =>
    currentKey === ev.id ? false : keyHasMbid(ev.id) || !keyHasMbid(currentKey);

  let dbEvent = null;
  const byKey = await prisma.event.findUnique({ where: { dedupeKey: ev.id } });
  if (byKey && !claimed.has(byKey.id)) {
    dbEvent = await prisma.event.update({ where: { id: byKey.id }, data: common });
  }

  if (!dbEvent && ev.sources.length > 0) {
    const bySource = await prisma.eventSource.findFirst({
      where: {
        OR: ev.sources.map((s) => ({
          provider: toDbProvider(s.provider),
          sourceId: s.sourceId,
        })),
      },
      select: { eventId: true, event: { select: { dedupeKey: true } } },
    });
    if (bySource && !claimed.has(bySource.eventId)) {
      dbEvent = await prisma.event
        .update({
          where: { id: bySource.eventId },
          data: mayRekey(bySource.event.dedupeKey) ? { dedupeKey: ev.id, ...common } : common,
        })
        // Unique race (another tick just claimed the key): fall through.
        .catch(() => null);
    }
  }
  if (!dbEvent) {
    const sameDay = await prisma.event.findMany({
      where: {
        date: isoDateToUtc(ev.date),
        artists: { some: { artistId: syncedArtist.id } },
      },
      include: { venue: true },
    });
    const drifted = sameDay.find(
      (c) => !claimed.has(c.id) && venueSimilarity(c.venue.name, ev.venue.name) >= 0.6,
    );
    if (drifted) {
      dbEvent = await prisma.event
        .update({
          where: { id: drifted.id },
          data: mayRekey(drifted.dedupeKey) ? { dedupeKey: ev.id, ...common } : common,
        })
        .catch(() => null);
    }
  }
  if (!dbEvent) {
    dbEvent = await prisma.event.upsert({
      where: { dedupeKey: ev.id },
      create: { dedupeKey: ev.id, firstSeenAt: new Date(ev.firstSeenAt), ...common },
      update: common,
    });
  }
  claimed.add(dbEvent.id);

  // The synced artist headlines only when the canonical event says so — on a
  // co-billed show where they support, don't mislabel them as headliner.
  const isHeadliner = sameArtistName(syncedArtist.name, ev.artistName);
  await prisma.eventArtist.upsert({
    where: { eventId_artistId: { eventId: dbEvent.id, artistId: syncedArtist.id } },
    create: {
      eventId: dbEvent.id,
      artistId: syncedArtist.id,
      headliner: isHeadliner,
      position: isHeadliner ? 0 : 1,
    },
    update: { headliner: isHeadliner },
  });

  for (const s of ev.sources) {
    await prisma.eventSource.upsert({
      where: { provider_sourceId: { provider: toDbProvider(s.provider), sourceId: s.sourceId } },
      create: {
        eventId: dbEvent.id,
        provider: toDbProvider(s.provider),
        sourceId: s.sourceId,
        url: s.url ?? null,
        ticketUrl: s.ticketUrl ?? null,
        lastCheckedAt: new Date(s.lastCheckedAt),
      },
      update: {
        eventId: dbEvent.id,
        url: s.url ?? null,
        ticketUrl: s.ticketUrl ?? null,
        lastCheckedAt: new Date(s.lastCheckedAt),
      },
    });
  }
}

/** Same act, allowing for cosmetic cross-source name differences. */
function sameArtistName(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na === nb || similarity(na, nb) >= 0.85;
}

async function getOrCreateVenue(v: CoreVenue) {
  const existing = await prisma.venue.findFirst({
    where: { name: v.name, city: v.city ?? null },
  });
  if (existing) {
    // Backfill coordinates/metadata if we now have better data.
    if ((existing.latitude === null || existing.longitude === null) && v.location) {
      return prisma.venue.update({
        where: { id: existing.id },
        data: {
          latitude: v.location.lat,
          longitude: v.location.lng,
          country: existing.country ?? v.country ?? null,
          countryCode: existing.countryCode ?? v.countryCode ?? null,
          address: existing.address ?? v.address ?? null,
          timezone: existing.timezone ?? v.timezone ?? null,
        },
      });
    }
    return existing;
  }
  try {
    return await prisma.venue.create({
      data: {
        name: v.name,
        city: v.city ?? null,
        country: v.country ?? null,
        countryCode: v.countryCode ?? null,
        address: v.address ?? null,
        latitude: v.location?.lat ?? null,
        longitude: v.location?.lng ?? null,
        timezone: v.timezone ?? null,
      },
    });
  } catch {
    // Unique (name, city) race with a concurrent sync: the row exists now.
    const raced = await prisma.venue.findFirst({ where: { name: v.name, city: v.city ?? null } });
    if (raced) return raced;
    throw new Error(`Venue create failed for ${v.name}`);
  }
}

export function mapExternalIds(
  rows: ArtistExternalId[],
  mbid: string | null,
): ArtistExternalIds {
  const out: ArtistExternalIds = {};
  if (mbid) out.mbid = mbid;
  for (const r of rows) {
    const apply: Record<ExternalSource, () => void> = {
      MUSICBRAINZ: () => (out.mbid = r.externalId),
      TICKETMASTER: () => (out.ticketmasterAttractionId = r.externalId),
      BANDSINTOWN: () => (out.bandsintownId = r.externalId),
      SPOTIFY: () => (out.spotifyId = r.externalId),
      LASTFM: () => (out.lastfmName = r.externalId),
      SETLISTFM: () => (out.setlistfmId = r.externalId),
      WEBSITE: () => (out.officialWebsite = r.url ?? r.externalId),
    };
    apply[r.source]?.();
  }
  return out;
}
