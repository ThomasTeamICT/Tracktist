import "server-only";
import {
  monitorArtist,
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

  for (const event of result.events) {
    await persistCanonicalEvent(artist.id, event);
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

  return { eventCount: result.events.length };
}

/** Persist a batch of canonical events for an artist (worker/tests reuse this). */
export async function persistArtistEvents(
  headlinerArtistId: string,
  events: CanonicalEvent[],
): Promise<void> {
  for (const ev of events) await persistCanonicalEvent(headlinerArtistId, ev);
}

async function persistCanonicalEvent(headlinerArtistId: string, ev: CanonicalEvent): Promise<void> {
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

  const dbEvent = await prisma.event.upsert({
    where: { dedupeKey: ev.id },
    create: { dedupeKey: ev.id, firstSeenAt: new Date(ev.firstSeenAt), ...common },
    update: common,
  });

  await prisma.eventArtist.upsert({
    where: { eventId_artistId: { eventId: dbEvent.id, artistId: headlinerArtistId } },
    create: { eventId: dbEvent.id, artistId: headlinerArtistId, headliner: true, position: 0 },
    update: { headliner: true },
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
  return prisma.venue.create({
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
