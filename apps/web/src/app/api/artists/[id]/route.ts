import { apiUser, json, notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getUserAgenda } from "@/lib/queries";
import { toGlobeEvent } from "@/lib/serialize";
import { fromDbNotifyMode, fromDbPriority } from "@/lib/mappers";

export const dynamic = "force-dynamic";

/** GET /api/artists/:id — artist detail with the user's upcoming evaluated events. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const [artist, follow, agenda] = await Promise.all([
    prisma.artist.findUnique({ where: { id }, include: { externalIds: true } }),
    prisma.userArtistFollow.findUnique({ where: { userId_artistId: { userId: user.id, artistId: id } } }),
    getUserAgenda(user.id),
  ]);
  if (!artist) return notFound("artist not found");

  const events = agenda
    .filter((a) => a.db.artists.some((x) => x.artist.id === id))
    .map((a) => toGlobeEvent(a.evaluated, a.db.id, a.db, a.friendCount));

  return json({
    artist: {
      id: artist.id,
      name: artist.name,
      mbid: artist.mbid,
      disambiguation: artist.disambiguation,
      country: artist.country,
      genres: artist.genres,
      imageUrl: artist.imageUrl,
      bio: artist.bio,
      lastSyncedAt: artist.lastSyncedAt,
      externalIds: artist.externalIds.map((e) => ({ source: e.source, externalId: e.externalId, url: e.url })),
    },
    follow: follow
      ? {
          priority: fromDbPriority(follow.priority),
          mode: fromDbNotifyMode(follow.notifyMode),
          countryCodes: follow.countryCodes,
        }
      : null,
    events,
  });
}
