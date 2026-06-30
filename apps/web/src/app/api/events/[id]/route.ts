import { distancesForEvent } from "@tracktist/core";
import { apiUser, json, notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getUserAnchors } from "@/lib/queries";
import { dbEventToCanonical, type DbEventWithRelations } from "@/lib/mappers";

export const dynamic = "force-dynamic";

/** GET /api/events/:id — full event detail with per-anchor distances (brief §6.4). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const dbEvent = await prisma.event.findUnique({
    where: { id },
    include: {
      venue: true,
      artists: { include: { artist: { select: { id: true, name: true, mbid: true } } } },
      sources: true,
    },
  });
  if (!dbEvent) return notFound("event not found");

  const canonical = dbEventToCanonical(dbEvent as unknown as DbEventWithRelations);
  const anchors = await getUserAnchors(user.id);
  const distances = distancesForEvent(canonical, anchors);

  return json({
    event: {
      ...canonical,
      id: dbEvent.id, // expose the DB id as the public id
      dedupeKey: canonical.id,
    },
    distances,
    lastCheckedAt: dbEvent.lastCheckedAt,
  });
}
