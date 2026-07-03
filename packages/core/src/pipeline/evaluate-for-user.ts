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
  /** Event ids (canonical/dedupe keys) the user was already notified about. */
  previouslyNotifiedEventIds?: Set<string>;
  /**
   * Artist keys (MBID and lowercased name) with a recent notification —
   * powers the `only_new_tours` follow mode.
   */
  recentArtistNotifications?: Set<string>;
  /**
   * Previous ticket status per event id (from the stored change hash), so a
   * re-notify can be typed by what actually CHANGED rather than current state.
   */
  previousTicketStatusByEvent?: Map<string, string>;
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
  // Support acts too: a user who follows the SUPPORT act must get their own
  // follow rules applied to this event, not silent defaults.
  for (const support of event.supportActs) keys.push(support.toLowerCase());
  return keys;
}

const DEFAULT_RULES: ArtistFollowRules = { priority: "normal", mode: "within_distance" };

export function evaluateEventsForUser(input: EvaluateForUserInput): EvaluatedEvent[] {
  const now = input.now ?? new Date();
  const results = input.events.map((event) => {
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
        previouslyNotified: input.previouslyNotifiedEventIds?.has(event.id) ?? false,
        recentArtistNotification: followKey(event).some((k) =>
          input.recentArtistNotifications?.has(k),
        ),
        previousTicketStatus: input.previousTicketStatusByEvent?.get(event.id),
      },
      input.prefs,
    );

    return { event, nearest, withinRadius, relevance, notification, rules };
  });

  // `only_new_tours` must also hold WITHIN one batch: a 12-date tour ingested
  // by a single sync is one announcement wave, not twelve notifications.
  const touredArtists = new Set<string>();
  for (const r of results) {
    if (r.rules.mode !== "only_new_tours") continue;
    const n = r.notification;
    if (!n.notify) continue;
    // Lifecycle/ticket re-notifies about known shows still pass.
    if (n.type !== "new_show_nearby" && n.type !== "new_show_must_see") continue;
    const keys = followKey(r.event);
    if (keys.some((k) => touredArtists.has(k))) {
      r.notification = {
        notify: false,
        reason: "Tour already announced in this batch",
        dedupeKey: n.dedupeKey,
        digest: false,
      };
    } else {
      for (const k of keys) touredArtists.add(k);
    }
  }

  return results.map(({ rules: _rules, ...rest }) => rest);
}
