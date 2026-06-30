import "server-only";
import type { Artist as CoreArtist, ArtistExternalIds, ArtistPriority } from "@tracktist/core";
import type { ExternalSource } from "@prisma/client";
import { prisma } from "./prisma.js";
import { buildArtistResolver } from "./integrations.js";
import { toDbNotifyMode, toDbPriority } from "./mappers.js";
import { syncArtist } from "./sync.js";
import type { ArtistFollowRules } from "@tracktist/core";

/**
 * Following artists (brief §6.2). Creates/locates the canonical Artist row,
 * stores external ids, records the follow, and kicks an initial sync so the
 * "after adding, never search again" promise holds.
 */

export async function getOrCreateArtistFromCore(artist: CoreArtist) {
  let dbArtist;
  if (artist.mbid) {
    dbArtist = await prisma.artist.upsert({
      where: { mbid: artist.mbid },
      create: {
        mbid: artist.mbid,
        name: artist.name,
        sortName: artist.sortName ?? null,
        disambiguation: artist.disambiguation ?? null,
        country: artist.country ?? null,
        genres: artist.genres ?? [],
        imageUrl: artist.imageUrl ?? null,
      },
      update: {
        name: artist.name,
        disambiguation: artist.disambiguation ?? null,
        country: artist.country ?? null,
        genres: artist.genres ?? [],
      },
    });
  } else {
    dbArtist =
      (await prisma.artist.findFirst({ where: { name: artist.name } })) ??
      (await prisma.artist.create({ data: { name: artist.name, genres: artist.genres ?? [] } }));
  }
  await upsertExternalIds(dbArtist.id, artist.externalIds);
  return dbArtist;
}

async function upsertExternalIds(artistId: string, ext: ArtistExternalIds): Promise<void> {
  const entries: { source: ExternalSource; externalId: string; url?: string }[] = [];
  if (ext.mbid) entries.push({ source: "MUSICBRAINZ", externalId: ext.mbid });
  if (ext.spotifyId) entries.push({ source: "SPOTIFY", externalId: ext.spotifyId });
  if (ext.lastfmName) entries.push({ source: "LASTFM", externalId: ext.lastfmName });
  if (ext.setlistfmId) entries.push({ source: "SETLISTFM", externalId: ext.setlistfmId });
  if (ext.ticketmasterAttractionId)
    entries.push({ source: "TICKETMASTER", externalId: ext.ticketmasterAttractionId });
  if (ext.bandsintownId) entries.push({ source: "BANDSINTOWN", externalId: ext.bandsintownId });
  if (ext.officialWebsite)
    entries.push({ source: "WEBSITE", externalId: ext.officialWebsite, url: ext.officialWebsite });

  for (const e of entries) {
    await prisma.artistExternalId
      .upsert({
        where: { artistId_source: { artistId, source: e.source } },
        create: { artistId, source: e.source, externalId: e.externalId, url: e.url ?? null },
        update: { externalId: e.externalId, url: e.url ?? null },
      })
      .catch(() => undefined); // ignore (source, externalId) unique collisions
  }
}

export interface FollowResult {
  artistId: string;
  name: string;
  alreadyFollowing: boolean;
}

/** Follow a resolved artist (already turned into a core Artist) for a user. */
export async function followResolvedArtist(
  userId: string,
  artist: CoreArtist,
  opts: { priority?: ArtistPriority; sync?: boolean } = {},
): Promise<FollowResult> {
  const dbArtist = await getOrCreateArtistFromCore(artist);
  const existing = await prisma.userArtistFollow.findUnique({
    where: { userId_artistId: { userId, artistId: dbArtist.id } },
  });
  if (!existing) {
    await prisma.userArtistFollow.create({
      data: {
        userId,
        artistId: dbArtist.id,
        priority: toDbPriority(opts.priority ?? "normal"),
      },
    });
  }

  // Kick an initial sync (best-effort; live providers no-op without keys).
  if (opts.sync !== false) {
    syncArtist(dbArtist.id).catch((err) => console.error("initial sync failed", err));
  }

  return { artistId: dbArtist.id, name: dbArtist.name, alreadyFollowing: Boolean(existing) };
}

/** Resolve a name then follow it; returns null when the name is too ambiguous. */
export async function followByName(
  userId: string,
  name: string,
  opts: { priority?: ArtistPriority } = {},
): Promise<FollowResult | null> {
  const resolver = buildArtistResolver();
  const artist = await resolver.resolve(name);
  if (!artist) return null;
  return followResolvedArtist(userId, artist, opts);
}

export async function unfollowArtist(userId: string, artistId: string): Promise<void> {
  await prisma.userArtistFollow
    .delete({ where: { userId_artistId: { userId, artistId } } })
    .catch(() => undefined);
}

export async function setFollowPreferences(
  userId: string,
  artistId: string,
  rules: Partial<ArtistFollowRules>,
): Promise<void> {
  await prisma.userArtistFollow.update({
    where: { userId_artistId: { userId, artistId } },
    data: {
      ...(rules.priority ? { priority: toDbPriority(rules.priority) } : {}),
      ...(rules.mode ? { notifyMode: toDbNotifyMode(rules.mode) } : {}),
      ...(rules.countryCodes ? { countryCodes: rules.countryCodes } : {}),
    },
  });
}
