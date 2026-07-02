import "server-only";
import {
  evaluateEventsForUser,
  isInQuietHours,
  notificationChangeHash,
  type NotificationType as CoreNotificationType,
} from "@tracktist/core";
import type { NotificationType } from "@prisma/client";
import { prisma } from "./prisma.js";
import { dbEventToCanonical } from "./mappers.js";
import {
  getFollowedEvents,
  getFollowsMap,
  getFriendCountByEvent,
  getNotificationPreferences,
  getUserAnchors,
} from "./queries.js";
import { getWebPushDevices, sendWebPushToDevices } from "./push.js";
import { formatDate, formatDistance } from "./utils.js";

const TYPE_TO_DB: Record<CoreNotificationType, NotificationType> = {
  new_show_nearby: "NEW_SHOW_NEARBY",
  new_show_must_see: "NEW_SHOW_MUST_SEE",
  tickets_available: "TICKETS_AVAILABLE",
  rescheduled: "RESCHEDULED",
  cancelled: "CANCELLED",
  friend_activity: "FRIEND_ACTIVITY",
  weekly_digest: "WEEKLY_DIGEST",
};

/** How long a notification counts as "the same announcement wave" (§6.5). */
const TOUR_WAVE_DAYS = 45;

/**
 * Evaluate a user's followed events and create notification rows (brief §6.5).
 *
 * Idempotent: rows are keyed on the (user, event, anchor) dedupeKey and only
 * (re)created when the change-hash differs — so the same show never notifies
 * twice, and a re-notify happens only on a date/venue/ticket/relevance change.
 *
 * Creation and dispatch are separate phases: rows are always recorded, but
 * web-push delivery is deferred during the user's quiet hours and picked up
 * by a later tick (sentAt stays null until actually sent).
 */
export async function notifyUser(
  userId: string,
): Promise<{ created: number; updated: number; dispatched: number }> {
  const [eventsDb, anchors, followsByArtist, prefs, friendCounts, prior] = await Promise.all([
    getFollowedEvents(userId),
    getUserAnchors(userId),
    getFollowsMap(userId),
    getNotificationPreferences(userId),
    getFriendCountByEvent(userId),
    prisma.notification.findMany({
      // Bounded context: recent rows (tour-wave window) plus rows tied to
      // still-upcoming events (previouslyNotified) — not the whole history.
      where: {
        userId,
        OR: [
          { createdAt: { gte: new Date(Date.now() - TOUR_WAVE_DAYS * 86_400_000) } },
          { event: { date: { gte: new Date(Date.now() - 2 * 86_400_000) } } },
        ],
      },
      select: {
        id: true,
        dedupeKey: true,
        changeHash: true,
        createdAt: true,
        event: { select: { dedupeKey: true } },
        artist: { select: { mbid: true, name: true } },
      },
    }),
  ]);
  const priorByKey = new Map(prior.map((n) => [n.dedupeKey, n]));

  // Context for the rules: which shows did we already tell this user about,
  // and which artists pinged them recently (powers `only_new_tours`).
  const previouslyNotifiedEventIds = new Set<string>();
  const recentArtistNotifications = new Set<string>();
  const waveCutoff = Date.now() - TOUR_WAVE_DAYS * 86_400_000;
  for (const n of prior) {
    if (n.event?.dedupeKey) previouslyNotifiedEventIds.add(n.event.dedupeKey);
    if (n.artist && n.createdAt.getTime() >= waveCutoff) {
      if (n.artist.mbid) recentArtistNotifications.add(n.artist.mbid);
      recentArtistNotifications.add(n.artist.name.toLowerCase());
    }
  }

  const byKey = new Map(eventsDb.map((e) => [e.dedupeKey, e]));
  const friendCountByEvent = new Map(
    eventsDb
      .map((e) => [e.dedupeKey, friendCounts.get(e.id) ?? 0] as const)
      .filter(([, n]) => n > 0),
  );
  const evaluated = evaluateEventsForUser({
    userId,
    anchors,
    events: eventsDb.map(dbEventToCanonical),
    followsByArtist,
    prefs,
    friendCountByEvent,
    previouslyNotifiedEventIds,
    recentArtistNotifications,
  });

  let created = 0;
  let updated = 0;

  for (const ev of evaluated) {
    try {
      const decision = ev.notification;
      if (!decision.notify || !decision.type) continue;

      const dbEvent = byKey.get(ev.event.id);
      if (!dbEvent) continue;

      const changeHash = notificationChangeHash(ev.event, ev.withinRadius);
      const existing = priorByKey.get(decision.dedupeKey);
      if (existing && existing.changeHash === changeHash) continue; // already notified, nothing changed

      const headliner = dbEvent.artists.find((a) => a.headliner) ?? dbEvent.artists[0];
      const distance = ev.nearest ? ` · ${formatDistance(ev.nearest.distanceKm)}` : "";
      const title = `${ev.event.artistName} — ${ev.event.venue.city ?? ev.event.venue.name}`;
      const body = `${formatDate(ev.event.date)}${distance} · ${ev.event.venue.name}`;

      const data = {
        type: TYPE_TO_DB[decision.type],
        title,
        body,
        changeHash,
        eventId: dbEvent.id,
        artistId: headliner?.artist.id ?? null,
        anchorId: ev.nearest?.anchorId ?? null,
        webPush: !decision.digest && (prefs.channels?.webPush ?? false),
        email: !decision.digest && (prefs.channels?.email ?? false),
        inApp: prefs.channels?.inApp ?? true,
      };

      if (existing) {
        await prisma.notification.update({
          where: { id: existing.id },
          data: { ...data, readAt: null, sentAt: null },
        });
        updated++;
      } else {
        await prisma.notification.create({
          data: { userId, dedupeKey: decision.dedupeKey, ...data },
        });
        created++;
      }
    } catch (err) {
      // One bad row (e.g. a unique-key race with a concurrent tick) must not
      // sink the rest of this user's notifications.
      console.error(`notification upsert failed for ${ev.event.id}`, err);
    }
  }

  const dispatched = await dispatchPendingPush(userId, prefs.quietHours);
  return { created, updated, dispatched };
}

/**
 * Deliver undelivered direct notifications via web push. Quiet hours (§6.5)
 * defer delivery — rows stay pending and the next tick retries, so an alert
 * created at 03:00 arrives after the window opens instead of never.
 */
async function dispatchPendingPush(
  userId: string,
  quietHours?: { start: string; end: string },
): Promise<number> {
  // Server-local time; per-user timezones are a v2 refinement.
  if (isInQuietHours(quietHours, new Date())) return 0;

  const pending = await prisma.notification.findMany({
    where: { userId, webPush: true, sentAt: null },
    orderBy: { createdAt: "asc" },
    take: 20, // don't burst-push an entire backlog at once
  });
  if (pending.length === 0) return 0;

  const devices = await getWebPushDevices(userId); // fetch once for the batch
  let dispatched = 0;
  for (const n of pending) {
    try {
      const result = await sendWebPushToDevices(devices, {
        title: n.title,
        body: n.body,
        url: n.eventId ? `/events/${n.eventId}` : "/notifications",
      });
      // Mark sent when delivered, or when there is simply nothing to deliver
      // to (no/expired subscriptions — retrying forever helps nobody). When
      // every attempt failed transiently, leave it pending for the next tick.
      if (result.delivered > 0 || result.attempted === 0) {
        await prisma.notification.update({ where: { id: n.id }, data: { sentAt: new Date() } });
        dispatched += result.delivered > 0 ? 1 : 0;
      }
    } catch {
      // Transient push failure: leave sentAt null so the next tick retries.
    }
  }
  return dispatched;
}

/** ISO-8601 week label, e.g. "2026-W27" — the digest idempotency key. */
function isoWeekLabel(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day); // nearest Thursday
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Weekly digest (brief §6.5): bundle the user's undelivered digest-mode
 * notifications into ONE summary push. Idempotent per ISO week.
 */
export async function sendWeeklyDigest(
  userId: string,
): Promise<{ sent: boolean; bundled: number }> {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs.digest) return { sent: false, bundled: 0 };

  const dedupeKey = `${userId}:digest:${isoWeekLabel(new Date())}`;
  const already = await prisma.notification.findUnique({ where: { dedupeKey } });
  if (already) return { sent: false, bundled: 0 };

  // Digest members: rows created in digest mode (no direct channels) that
  // were never delivered anywhere else.
  const pending = await prisma.notification.findMany({
    where: {
      userId,
      sentAt: null,
      webPush: false,
      email: false,
      type: { in: ["NEW_SHOW_NEARBY", "NEW_SHOW_MUST_SEE", "TICKETS_AVAILABLE"] },
    },
    orderBy: { createdAt: "asc" },
  });
  if (pending.length === 0) return { sent: false, bundled: 0 };

  const title = `Je weekoverzicht — ${pending.length} nieuwe show${pending.length === 1 ? "" : "s"}`;
  const body = pending
    .slice(0, 3)
    .map((n) => n.title)
    .join(" · ")
    .concat(pending.length > 3 ? ` · +${pending.length - 3} meer` : "");

  await prisma.notification.create({
    data: {
      userId,
      dedupeKey,
      type: "WEEKLY_DIGEST",
      title,
      body,
      webPush: prefs.channels?.webPush ?? false,
      email: prefs.channels?.email ?? false,
      inApp: true,
    },
  });
  const now = new Date();
  await prisma.notification.updateMany({
    where: { id: { in: pending.map((n) => n.id) } },
    data: { sentAt: now },
  });

  const dispatched = await dispatchPendingPush(userId, prefs.quietHours);
  return { sent: dispatched > 0 || !(prefs.channels?.webPush ?? false), bundled: pending.length };
}

/** Run the weekly digest for every user who opted in. */
export async function runWeeklyDigests(): Promise<{ users: number; bundled: number }> {
  const optedIn = await prisma.notificationPreference.findMany({
    where: { digest: true },
    select: { userId: true },
  });
  let users = 0;
  let bundled = 0;
  for (const { userId } of optedIn) {
    try {
      const res = await sendWeeklyDigest(userId);
      if (res.bundled > 0) {
        users++;
        bundled += res.bundled;
      }
    } catch (err) {
      console.error(`weekly digest failed for user ${userId}`, err);
    }
  }
  return { users, bundled };
}
