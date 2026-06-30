import { apiUser, json, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { fromDbNotifyMode, fromDbPriority } from "@/lib/mappers";

export const dynamic = "force-dynamic";

/** GET /api/artists/following — the user's followed artists + upcoming counts. */
export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const today = new Date(new Date().toISOString().slice(0, 10));

  const follows = await prisma.userArtistFollow.findMany({
    where: { userId: user.id },
    include: {
      artist: {
        include: {
          _count: {
            select: { events: { where: { event: { date: { gte: today } } } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const artists = follows.map((f) => ({
    id: f.artist.id,
    name: f.artist.name,
    mbid: f.artist.mbid,
    imageUrl: f.artist.imageUrl,
    disambiguation: f.artist.disambiguation,
    country: f.artist.country,
    genres: f.artist.genres,
    priority: fromDbPriority(f.priority),
    notifyMode: fromDbNotifyMode(f.notifyMode),
    countryCodes: f.countryCodes,
    upcomingEvents: f.artist._count.events,
    lastSyncedAt: f.artist.lastSyncedAt,
  }));

  return json({ artists });
}
