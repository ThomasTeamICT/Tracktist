import "server-only";
import { prisma } from "./prisma.js";
import { syncArtist } from "./sync.js";
import { notifyUser, runWeeklyDigests } from "./notify.js";

/**
 * The background "tick" the worker drives (brief §5.2): sync artists that are
 * due, then (re)generate notifications for everyone who follows them. Kept in
 * the web app so all DB/sync logic has a single home; the worker is a thin
 * scheduler that calls /api/internal/tick.
 */
export async function runSyncTick(
  opts: { limit?: number; staleHours?: number; digest?: boolean } = {},
) {
  const limit = opts.limit ?? 25;
  const staleHours = opts.staleHours ?? 24;
  const cutoff = new Date(Date.now() - staleHours * 3_600_000);

  const dueArtists = await prisma.artist.findMany({
    where: {
      follows: { some: {} }, // only artists somebody follows (shared pool — §5.2)
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: cutoff } }],
    },
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
    take: limit,
    select: { id: true },
  });

  let syncedEvents = 0;
  for (const a of dueArtists) {
    try {
      const { eventCount } = await syncArtist(a.id);
      syncedEvents += eventCount;
    } catch (err) {
      console.error(`sync failed for artist ${a.id}`, err);
    }
  }

  // Notify everyone who follows a synced artist.
  let notified = 0;
  if (dueArtists.length > 0) {
    const followers = await prisma.userArtistFollow.findMany({
      where: { artistId: { in: dueArtists.map((a) => a.id) } },
      select: { userId: true },
      distinct: ["userId"],
    });
    for (const f of followers) {
      try {
        const res = await notifyUser(f.userId);
        notified += res.created + res.updated;
      } catch (err) {
        console.error(`notify failed for user ${f.userId}`, err);
      }
    }
  }

  // Weekly digest pass (idempotent per ISO week — safe to trigger repeatedly).
  let digests: { users: number; bundled: number } | undefined;
  if (opts.digest) {
    digests = await runWeeklyDigests();
  }

  return { artistsSynced: dueArtists.length, syncedEvents, notificationsTouched: notified, digests };
}
