import "server-only";
import { cache } from "react";
import {
  evaluateEventsForUser,
  type Anchor,
  type ArtistFollowRules,
  type EvaluatedEvent,
  type NotificationPreferences,
} from "@tracktist/core";
import { prisma } from "./prisma.js";
import {
  dbEventToCanonical,
  fromDbNotifyMode,
  fromDbPriority,
  type DbEventWithRelations,
} from "./mappers.js";

/** Prisma include shape that satisfies {@link dbEventToCanonical}. */
const eventInclude = {
  venue: true,
  artists: { include: { artist: { select: { id: true, name: true, mbid: true, imageUrl: true } } } },
  sources: true,
} as const;

/** Future events (today onward) for artists the user follows. */
export async function getFollowedEvents(userId: string): Promise<DbEventWithRelations[]> {
  const follows = await prisma.userArtistFollow.findMany({
    where: { userId },
    select: { artistId: true },
  });
  if (follows.length === 0) return [];
  const artistIds = follows.map((f) => f.artistId);
  // One day of slack behind UTC-today: venue-local "tonight" west of UTC must
  // not vanish from the agenda hours before the show starts.
  const cutoff = new Date(new Date(Date.now() - 86_400_000).toISOString().slice(0, 10));

  // Bounded horizon: agendas care about the coming season(s), and an
  // unbounded query would grow with every festival announcement cycle.
  const horizon = new Date(Date.now() + 548 * 86_400_000); // ~18 months

  const events = await prisma.event.findMany({
    where: {
      date: { gte: cutoff, lte: horizon },
      artists: { some: { artistId: { in: artistIds } } },
    },
    include: eventInclude,
    orderBy: { date: "asc" },
    take: 500,
  });
  return events as unknown as DbEventWithRelations[];
}

export const getUserAnchors = cache(async (userId: string): Promise<Anchor[]> => {
  const rows = await prisma.userLocation.findMany({ where: { userId } });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    location: { lat: r.latitude, lng: r.longitude },
    city: r.city ?? undefined,
    country: r.country ?? undefined,
    radiusKm: r.radiusKm,
    active: r.active,
    startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : undefined,
    endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : undefined,
  }));
});

export async function getFollowsMap(userId: string): Promise<Map<string, ArtistFollowRules>> {
  const follows = await prisma.userArtistFollow.findMany({
    where: { userId },
    include: { artist: { select: { name: true, mbid: true } } },
  });
  const map = new Map<string, ArtistFollowRules>();
  for (const f of follows) {
    const rules: ArtistFollowRules = {
      priority: fromDbPriority(f.priority),
      mode: fromDbNotifyMode(f.notifyMode),
      countryCodes: f.countryCodes,
    };
    if (f.artist.mbid) map.set(f.artist.mbid, rules);
    map.set(f.artist.name.toLowerCase(), rules);
  }
  return map;
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const p = await prisma.notificationPreference.findUnique({ where: { userId } });
  // Default matches the settings UI: external channels (push/e-mail) are
  // opt-in; only the in-app inbox is on until the user chooses otherwise.
  if (!p) return { digest: false, channels: { webPush: false, email: false, inApp: true } };
  return {
    maxDistanceKm: p.maxDistanceKm ?? undefined,
    countryCodes: p.countryCodes,
    onlyMustSee: p.onlyMustSee,
    noFestivals: p.noFestivals,
    onlyWeekends: p.onlyWeekends,
    onlyWithTicketLink: p.onlyWithTicketLink,
    onlyIfFriendsFollow: p.onlyIfFriendsFollow,
    digest: p.digest,
    quietHours:
      p.quietHoursStart && p.quietHoursEnd
        ? { start: p.quietHoursStart, end: p.quietHoursEnd }
        : undefined,
    channels: { webPush: p.webPush, email: p.email, inApp: p.inApp },
  };
}

/**
 * How many of the user's (accepted) friends marked interest in each event.
 * Keyed by DB event id. Powers the friend-boost in relevance, the
 * "onlyIfFriendsFollow" filter and the 👥 badge on event cards (brief §6.4).
 */
export async function getFriendCountByEvent(userId: string): Promise<Map<string, number>> {
  const friendships = await prisma.friendship.findMany({
    where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });
  const friendIds = friendships.map((f) =>
    f.requesterId === userId ? f.addresseeId : f.requesterId,
  );
  if (friendIds.length === 0) return new Map();

  const interests = await prisma.groupEventInterest.findMany({
    where: { userId: { in: friendIds }, status: { in: ["GOING", "MAYBE"] } },
    select: { eventId: true, userId: true },
  });
  const byEvent = new Map<string, Set<string>>();
  for (const i of interests) {
    const set = byEvent.get(i.eventId) ?? new Set<string>();
    set.add(i.userId);
    byEvent.set(i.eventId, set);
  }
  return new Map([...byEvent.entries()].map(([eventId, set]) => [eventId, set.size]));
}

export interface AgendaItem {
  evaluated: EvaluatedEvent;
  db: DbEventWithRelations;
  /** Accepted friends interested in this event. */
  friendCount: number;
}

/**
 * The user's agenda: each evaluated event paired with its DB row (so callers
 * have both the core scoring and the real DB id for links/serialization).
 * Sorted by date ascending. cache(): several server components (layout, page,
 * sub-sections) ask for the agenda in one request — evaluate once.
 */
export const getUserAgenda = cache(async (userId: string): Promise<AgendaItem[]> => {
  const [eventsDb, anchors, followsByArtist, prefs, friendCounts] = await Promise.all([
    getFollowedEvents(userId),
    getUserAnchors(userId),
    getFollowsMap(userId),
    getNotificationPreferences(userId),
    getFriendCountByEvent(userId),
  ]);
  // The evaluator keys friend counts on the canonical event id (dedupeKey).
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
  });
  const byKey = new Map(eventsDb.map((e) => [e.dedupeKey, e]));
  return evaluated
    .map((ev) => ({
      evaluated: ev,
      db: byKey.get(ev.event.id),
      friendCount: friendCountByEvent.get(ev.event.id) ?? 0,
    }))
    .filter((x): x is AgendaItem => Boolean(x.db));
});

/**
 * Full per-user evaluation (distance + relevance + notification) over the
 * user's followed events — same pipeline as {@link getUserAgenda}, evaluation
 * side only.
 */
export async function evaluateUserEvents(userId: string): Promise<EvaluatedEvent[]> {
  return (await getUserAgenda(userId)).map((a) => a.evaluated);
}

/**
 * PostGIS-backed nearby lookup (brief §7): event ids within `radiusKm` of a
 * point, border-agnostic, ordered by distance. Uses the GIST expression index.
 */
export async function findNearbyEventIds(
  lat: number,
  lng: number,
  radiusKm: number,
  range?: { from?: string; to?: string },
): Promise<{ eventId: string; distanceKm: number }[]> {
  const from = range?.from ?? new Date().toISOString().slice(0, 10);
  const to = range?.to ?? "2100-01-01";
  const rows = await prisma.$queryRaw<{ id: string; km: number }[]>`
    SELECT e.id,
           ST_Distance(
             ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
             ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
           ) / 1000.0 AS km
    FROM "Event" e
    JOIN "Venue" v ON v.id = e."venueId"
    WHERE v.latitude IS NOT NULL
      AND v.longitude IS NOT NULL
      AND e.date BETWEEN ${from}::date AND ${to}::date
      AND ST_DWithin(
        ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusKm * 1000}
      )
    ORDER BY km ASC
    LIMIT 500;
  `;
  return rows.map((r) => ({ eventId: r.id, distanceKm: Math.round(r.km * 10) / 10 }));
}
