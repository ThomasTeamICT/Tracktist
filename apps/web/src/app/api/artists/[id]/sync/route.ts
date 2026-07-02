import { apiUser, forbidden, json, serverError, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { syncArtist } from "@/lib/sync";

/** Don't hit the providers again for an artist synced this recently. */
const DEBOUNCE_MINUTES = 10;

/**
 * POST /api/artists/:id/sync — manually trigger a sync for one artist.
 * Follow-gated + debounced: an authenticated user can only refresh artists
 * they follow, and never more than once per debounce window (protects the
 * shared provider quota from abuse — brief §5.2).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const follow = await prisma.userArtistFollow.findUnique({
    where: { userId_artistId: { userId: user.id, artistId: id } },
    include: { artist: { select: { lastSyncedAt: true } } },
  });
  if (!follow) return forbidden("volg deze artiest om een sync te starten");

  const last = follow.artist.lastSyncedAt;
  if (last && Date.now() - last.getTime() < DEBOUNCE_MINUTES * 60_000) {
    return json({ ok: true, skipped: true, reason: "recent gesynchroniseerd" });
  }

  try {
    const result = await syncArtist(id);
    return json({ ok: true, ...result });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : "sync failed");
  }
}
