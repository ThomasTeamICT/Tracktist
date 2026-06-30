import "server-only";
import {
  evaluateEventsForUser,
  notificationChangeHash,
  type NotificationType as CoreNotificationType,
} from "@tracktist/core";
import type { NotificationType } from "@prisma/client";
import { prisma } from "./prisma.js";
import { dbEventToCanonical } from "./mappers.js";
import {
  getFollowedEvents,
  getFollowsMap,
  getNotificationPreferences,
  getUserAnchors,
} from "./queries.js";
import { sendWebPushToUser } from "./push.js";

const TYPE_TO_DB: Record<CoreNotificationType, NotificationType> = {
  new_show_nearby: "NEW_SHOW_NEARBY",
  new_show_must_see: "NEW_SHOW_MUST_SEE",
  tickets_available: "TICKETS_AVAILABLE",
  rescheduled: "RESCHEDULED",
  cancelled: "CANCELLED",
  friend_activity: "FRIEND_ACTIVITY",
  weekly_digest: "WEEKLY_DIGEST",
};

/**
 * Evaluate a user's followed events and create notification rows (brief §6.5).
 *
 * Idempotent: rows are keyed on the (user, event, anchor) dedupeKey and only
 * (re)created when the change-hash differs — so the same show never notifies
 * twice, and a re-notify happens only on a date/venue/ticket/relevance change.
 * Direct (non-digest) notifications are dispatched immediately via web push.
 */
export async function notifyUser(userId: string): Promise<{ created: number; updated: number }> {
  const [eventsDb, anchors, followsByArtist, prefs] = await Promise.all([
    getFollowedEvents(userId),
    getUserAnchors(userId),
    getFollowsMap(userId),
    getNotificationPreferences(userId),
  ]);

  const byKey = new Map(eventsDb.map((e) => [e.dedupeKey, e]));
  const evaluated = evaluateEventsForUser({
    userId,
    anchors,
    events: eventsDb.map(dbEventToCanonical),
    followsByArtist,
    prefs,
  });

  let created = 0;
  let updated = 0;

  for (const ev of evaluated) {
    const decision = ev.notification;
    if (!decision.notify || !decision.type) continue;

    const dbEvent = byKey.get(ev.event.id);
    if (!dbEvent) continue;

    const changeHash = notificationChangeHash(ev.event, ev.withinRadius);
    const existing = await prisma.notification.findUnique({
      where: { dedupeKey: decision.dedupeKey },
    });
    if (existing && existing.changeHash === changeHash) continue; // already notified, nothing changed

    const headliner = dbEvent.artists.find((a) => a.headliner) ?? dbEvent.artists[0];
    const distance = ev.nearest ? ` · ${ev.nearest.distanceKm} km` : "";
    const title = `${ev.event.artistName} — ${ev.event.venue.city ?? ev.event.venue.name}`;
    const body = `${ev.event.date}${distance} · ${ev.event.venue.name}`;

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

    // Direct (non-digest) dispatch.
    if (!decision.digest) {
      await sendWebPushToUser(userId, { title, body, url: `/events/${dbEvent.id}` }).catch(() => undefined);
      await prisma.notification.update({
        where: { dedupeKey: decision.dedupeKey },
        data: { sentAt: new Date() },
      });
    }
  }

  return { created, updated };
}
