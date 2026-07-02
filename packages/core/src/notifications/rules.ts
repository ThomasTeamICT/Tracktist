import type { Anchor } from "../types/geo.js";
import type { ArtistFollowRules, ArtistPriority } from "../types/artist.js";
import type { CanonicalEvent } from "../types/event.js";

/**
 * Notification rules + idempotency (brief §6.5).
 *
 * Decides whether a (user, event, anchor) triple is eligible to notify, which
 * type, and whether it goes in a digest or direct. Smart filters fight
 * notification fatigue. The dedupe key + change hash guarantee we never send
 * the same event twice and only re-notify on a meaningful change.
 */

export type NotificationType =
  | "new_show_nearby"
  | "new_show_must_see"
  | "tickets_available"
  | "rescheduled"
  | "cancelled"
  | "friend_activity"
  | "weekly_digest";

export interface NotificationChannels {
  webPush: boolean;
  email: boolean;
  inApp: boolean;
}

export interface NotificationPreferences {
  maxDistanceKm?: number;
  /** Restrict to these ISO alpha-2 country codes. */
  countryCodes?: string[];
  onlyMustSee?: boolean;
  noFestivals?: boolean;
  onlyWeekends?: boolean;
  onlyWithTicketLink?: boolean;
  onlyIfFriendsFollow?: boolean;
  /** Group into a digest instead of sending directly. */
  digest?: boolean;
  channels?: NotificationChannels;
  /** Local quiet-hours window, "HH:mm". */
  quietHours?: { start: string; end: string };
}

export interface NotificationContext {
  userId: string;
  event: CanonicalEvent;
  /** The anchor that matched (closest within radius), if any. */
  anchor?: Anchor;
  distanceKm?: number;
  withinRadius: boolean;
  priority: ArtistPriority;
  followRules: ArtistFollowRules;
  friendCount: number;
  hasTicketLink: boolean;
  /** The user has already been notified about this event before. */
  previouslyNotified?: boolean;
  /**
   * The user was recently notified about another show of this artist —
   * used by the `only_new_tours` follow mode (one ping per announcement
   * wave, not one per show).
   */
  recentArtistNotification?: boolean;
}

export interface NotificationDecision {
  notify: boolean;
  type?: NotificationType;
  reason: string;
  dedupeKey: string;
  /** True = batch into a digest; false = send directly. */
  digest: boolean;
}

/** Stable per-(user,event,anchor) idempotency key (brief §6.5). */
export function dedupeKey(userId: string, eventId: string, anchorId?: string): string {
  return `${userId}:${eventId}:${anchorId ?? "global"}`;
}

/**
 * Fields whose change should trigger a re-notification: date, venue, ticket
 * status and whether it's now within radius (brief §6.5). Returns a compact
 * hash string the caller stores and compares.
 */
export function notificationChangeHash(
  event: Pick<CanonicalEvent, "date" | "venue" | "ticketStatus" | "status">,
  withinRadius: boolean,
): string {
  return [
    event.date,
    event.venue.name,
    event.status,
    event.ticketStatus,
    withinRadius ? "in" : "out",
  ].join("|");
}

function isWeekend(isoDate: string): boolean {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6; // Sun or Sat
}

/**
 * Is `at` inside the quiet-hours window? Supports windows that cross
 * midnight ("22:00"–"08:00"). Uses the local time of `at`; delivery layers
 * defer dispatch (not creation) while this is true.
 */
export function isInQuietHours(
  quietHours: NotificationPreferences["quietHours"],
  at: Date,
): boolean {
  if (!quietHours) return false;
  const toMinutes = (hhmm: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  };
  const start = toMinutes(quietHours.start);
  const end = toMinutes(quietHours.end);
  if (start === null || end === null || start === end) return false;
  const now = at.getHours() * 60 + at.getMinutes();
  return start < end ? now >= start && now < end : now >= start || now < end;
}

export function evaluateNotification(
  ctx: NotificationContext,
  prefs: NotificationPreferences,
): NotificationDecision {
  const key = dedupeKey(ctx.userId, ctx.event.id, ctx.anchor?.id);
  const deny = (reason: string): NotificationDecision => ({
    notify: false,
    reason,
    dedupeKey: key,
    digest: false,
  });

  const isMustSee = ctx.priority === "must_see";

  // High-importance lifecycle changes bypass distance/digest — but only for
  // shows the user actually knew about, and never against an explicit
  // "dashboard only" wish. A cancellation of a show we never announced to
  // this user is not news to them.
  const lifecycleEligible =
    ctx.previouslyNotified === true && ctx.followRules.mode !== "dashboard_only";
  if (ctx.event.status === "cancelled") {
    if (lifecycleEligible) {
      return { notify: true, type: "cancelled", reason: "Event cancelled", dedupeKey: key, digest: false };
    }
    return deny("Cancelled show the user was never notified about");
  }
  if (ctx.event.status === "rescheduled" && lifecycleEligible) {
    return { notify: true, type: "rescheduled", reason: "Event rescheduled", dedupeKey: key, digest: false };
  }
  // A rescheduled show the user never knew about falls through and is simply
  // judged as a (new) show by the normal rules.

  // Per-follow rule mode.
  switch (ctx.followRules.mode) {
    case "dashboard_only":
      return deny("Follow set to dashboard only");
    case "only_countries": {
      const allowed = ctx.followRules.countryCodes ?? [];
      if (!ctx.event.venue.countryCode || !allowed.includes(ctx.event.venue.countryCode)) {
        return deny("Outside allowed countries for this artist");
      }
      break;
    }
    case "only_with_tickets":
      if (!ctx.hasTicketLink || ctx.event.ticketStatus !== "available") {
        return deny("No tickets available yet");
      }
      break;
    case "within_distance":
      if (!ctx.withinRadius && !isMustSee) return deny("Outside notification radius");
      break;
    case "only_new_tours":
      // One notification per announcement wave: stay quiet while another
      // show of this artist was recently notified (re-notifies about THIS
      // event still pass, keyed on previouslyNotified).
      if (ctx.recentArtistNotification && !ctx.previouslyNotified) {
        return deny("Tour already announced recently");
      }
      break;
    case "always":
      break;
  }

  // Global preference filters (skip distance gating for must-see, per §7).
  if (prefs.onlyMustSee && !isMustSee) return deny("Only must-see enabled");
  if (prefs.noFestivals && ctx.event.isFestival) return deny("Festivals muted");
  if (prefs.onlyWeekends && !isWeekend(ctx.event.date)) return deny("Weekends only");
  if (prefs.onlyWithTicketLink && !ctx.hasTicketLink) return deny("Requires a ticket link");
  if (prefs.onlyIfFriendsFollow && ctx.friendCount <= 0) return deny("Only when friends follow");
  if (
    prefs.countryCodes?.length &&
    (!ctx.event.venue.countryCode || !prefs.countryCodes.includes(ctx.event.venue.countryCode))
  ) {
    return deny("Outside preferred countries");
  }
  if (
    prefs.maxDistanceKm !== undefined &&
    ctx.distanceKm !== undefined &&
    ctx.distanceKm > prefs.maxDistanceKm &&
    !isMustSee
  ) {
    return deny("Beyond max notification distance");
  }
  if (!ctx.withinRadius && !isMustSee && ctx.followRules.mode === "within_distance") {
    return deny("Outside notification radius");
  }

  // A re-notify for a show the user knows, triggered by tickets going on
  // sale, is a ticket alert — not another "new show".
  const isTicketDrop = ctx.previouslyNotified === true && ctx.event.ticketStatus === "available";
  const type: NotificationType = isTicketDrop
    ? "tickets_available"
    : isMustSee
      ? "new_show_must_see"
      : "new_show_nearby";
  // Must-see always goes direct; otherwise honour the digest preference.
  const digest = prefs.digest === true && !isMustSee;
  return {
    notify: true,
    type,
    reason: isTicketDrop
      ? "Tickets are now available"
      : isMustSee
        ? "Must-see artist announced a show"
        : "New show within your radius",
    dedupeKey: key,
    digest,
  };
}
