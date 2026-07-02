import { describe, expect, it } from "vitest";
import type { CanonicalEvent } from "../types/event.js";
import {
  evaluateNotification,
  isInQuietHours,
  type NotificationContext,
  type NotificationPreferences,
} from "./rules.js";

function event(partial: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    id: "mbid-x|2026-11-12|afas",
    artistMbid: "mbid-x",
    artistName: "The National",
    supportActs: [],
    date: "2026-11-13", // a Friday
    startTime: "20:00",
    timezone: "Europe/Amsterdam",
    venue: {
      name: "AFAS Live",
      city: "Amsterdam",
      country: "Netherlands",
      countryCode: "NL",
      location: { lat: 52.31, lng: 4.94 },
    },
    status: "tickets_available",
    ticketStatus: "available",
    isFestival: false,
    sources: [],
    confidenceScore: 1,
    firstSeenAt: "2026-06-01T00:00:00.000Z",
    lastCheckedAt: "2026-06-01T00:00:00.000Z",
    ...partial,
  };
}

function ctx(partial: Partial<NotificationContext> = {}): NotificationContext {
  return {
    userId: "user-1",
    event: event(),
    withinRadius: true,
    distanceKm: 150,
    priority: "normal",
    followRules: { priority: "normal", mode: "within_distance" },
    friendCount: 0,
    hasTicketLink: true,
    ...partial,
  };
}

const PREFS: NotificationPreferences = { channels: { webPush: true, email: false, inApp: true } };

describe("evaluateNotification — lifecycle changes", () => {
  it("notifies a cancellation only when the user knew about the show", () => {
    const cancelled = event({ status: "cancelled", ticketStatus: "cancelled" });
    const known = evaluateNotification(
      ctx({ event: cancelled, previouslyNotified: true }),
      PREFS,
    );
    expect(known.notify).toBe(true);
    expect(known.type).toBe("cancelled");

    const unknown = evaluateNotification(
      ctx({ event: cancelled, previouslyNotified: false }),
      PREFS,
    );
    expect(unknown.notify).toBe(false);
  });

  it("never sends lifecycle alerts to a dashboard_only follow", () => {
    const cancelled = event({ status: "cancelled" });
    const d = evaluateNotification(
      ctx({
        event: cancelled,
        previouslyNotified: true,
        followRules: { priority: "normal", mode: "dashboard_only" },
      }),
      PREFS,
    );
    expect(d.notify).toBe(false);
  });

  it("treats an unseen rescheduled show as a plain new show", () => {
    const rescheduled = event({ status: "rescheduled" });
    const d = evaluateNotification(ctx({ event: rescheduled, previouslyNotified: false }), PREFS);
    expect(d.notify).toBe(true);
    expect(d.type).toBe("new_show_nearby");
  });
});

describe("evaluateNotification — only_new_tours", () => {
  const follow = { priority: "normal", mode: "only_new_tours" } as const;

  it("notifies the first show of an announcement wave", () => {
    const d = evaluateNotification(
      ctx({ followRules: follow, recentArtistNotification: false }),
      PREFS,
    );
    expect(d.notify).toBe(true);
  });

  it("stays quiet while the tour was already announced recently", () => {
    const d = evaluateNotification(
      ctx({ followRules: follow, recentArtistNotification: true }),
      PREFS,
    );
    expect(d.notify).toBe(false);
  });

  it("still allows a re-notify about an event the user already knows", () => {
    const d = evaluateNotification(
      ctx({ followRules: follow, recentArtistNotification: true, previouslyNotified: true }),
      PREFS,
    );
    expect(d.notify).toBe(true);
  });
});

describe("isInQuietHours", () => {
  const at = (hhmm: string) => new Date(`2026-06-01T${hhmm}:00`);

  it("handles a window crossing midnight", () => {
    const win = { start: "22:00", end: "08:00" };
    expect(isInQuietHours(win, at("23:30"))).toBe(true);
    expect(isInQuietHours(win, at("03:00"))).toBe(true);
    expect(isInQuietHours(win, at("08:00"))).toBe(false);
    expect(isInQuietHours(win, at("12:00"))).toBe(false);
  });

  it("handles a same-day window and disabled/invalid input", () => {
    expect(isInQuietHours({ start: "13:00", end: "14:00" }, at("13:30"))).toBe(true);
    expect(isInQuietHours({ start: "13:00", end: "14:00" }, at("14:30"))).toBe(false);
    expect(isInQuietHours(undefined, at("13:30"))).toBe(false);
    expect(isInQuietHours({ start: "aa", end: "14:00" }, at("13:30"))).toBe(false);
    expect(isInQuietHours({ start: "13:00", end: "13:00" }, at("13:00"))).toBe(false);
  });
});
