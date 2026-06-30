import type { Anchor } from "../types/geo.js";
import type { ArtistFollowRules } from "../types/artist.js";
import type { CanonicalEvent } from "../types/event.js";
import {
  bestWithinRadius,
  distancesForEvent,
  type DistanceResult,
} from "../geo/distance.js";
import {
  computeRelevance,
  daysUntil,
  type RelevanceBreakdown,
} from "../relevance/relevance.js";
import {
  evaluateNotification,
  type NotificationDecision,
  type NotificationPreferences,
} from "../notifications/rules.js";

/**
 * Per-user evaluation pipeline (brief §5.5, steps 7–10): distance per anchor,
 * relevance score, and notification candidate decision for one user over a set
 * of canonical events.
 */

export interface EvaluateForUserInput {
  userId: string;
  anchors: Anchor[];
  events: CanonicalEvent[];
  /** Follow rules keyed by artist MBID, falling back to lowercased name. */
  followsByArtist: Map<string, ArtistFollowRules>;
  prefs: NotificationPreferences;
  /** Optional friend interest counts keyed by event id. */
  friendCountByEvent?: Map<string, number>;
  /** Injected clock for deterministic date scoring. */
  now?: Date;
}

export interface EvaluatedEvent {
  event: CanonicalEvent;
  /** Closest anchor distance (may be outside radius); null if no coordinates. */
  nearest: DistanceResult | null;
  withinRadius: boolean;
  relevance: RelevanceBreakdown;
  notification: NotificationDecision;
}

function followKey(event: CanonicalEvent): string[] {
  const keys: string[] = [];
  if (event.artistMbid) keys.push(event.artistMbid);
  keys.push(event.artistName.toLowerCase());
  return keys;
}

const DEFAULT_RULES: ArtistFollowRules = { priority: "normal", mode: "within_distance" };

export function evaluateEventsForUser(input: EvaluateForUserInput): EvaluatedEvent[] {
  const now = input.now ?? new Date();
  return input.events.map((event) => {
    const rules =
      followKey(event)
        .map((k) => input.followsByArtist.get(k))
        .find((r): r is ArtistFollowRules => Boolean(r)) ?? DEFAULT_RULES;

    const all = distancesForEvent(event, input.anchors);
    const nearest = all[0] ?? null;
    const within = bestWithinRadius(event, input.anchors);
    const withinRadius = within !== null;
    const friendCount = input.friendCountByEvent?.get(event.id) ?? 0;

    const relevance = computeRelevance({
      priority: rules.priority,
      distanceKm: (within ?? nearest)?.distanceKm,
      radiusKm: input.anchors.find((a) => a.id === (within ?? nearest)?.anchorId)?.radiusKm,
      ticketStatus: event.ticketStatus,
      friendCount,
      daysUntil: daysUntil(event.date, now),
    });

    const matchedAnchor =
      input.anchors.find((a) => a.id === (within ?? nearest)?.anchorId) ?? undefined;

    const notification = evaluateNotification(
      {
        userId: input.userId,
        event,
        anchor: matchedAnchor,
        distanceKm: (within ?? nearest)?.distanceKm,
        withinRadius,
        priority: rules.priority,
        followRules: rules,
        friendCount,
        hasTicketLink: event.sources.some((s) => Boolean(s.ticketUrl)),
      },
      input.prefs,
    );

    return { event, nearest, withinRadius, relevance, notification };
  });
}
