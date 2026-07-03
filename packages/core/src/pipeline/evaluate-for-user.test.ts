import { describe, expect, it } from "vitest";
import type { Anchor } from "../types/geo.js";
import type { ArtistFollowRules } from "../types/artist.js";
import type { CanonicalEvent } from "../types/event.js";
import { evaluateEventsForUser } from "./evaluate-for-user.js";

const HOME: Anchor = {
  id: "home",
  label: "Thuis",
  location: { lat: 51.03, lng: 4.1 },
  radiusKm: 350,
  active: true,
};

function event(id: string, date: string, partial: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    id,
    artistMbid: "mbid-x",
    artistName: "The National",
    supportActs: [],
    date,
    startTime: null,
    timezone: undefined,
    venue: {
      name: `Venue ${id}`,
      city: "Gent",
      country: "België",
      countryCode: "BE",
      location: { lat: 51.05, lng: 3.73 },
    },
    status: "announced",
    ticketStatus: "unknown",
    isFestival: false,
    sources: [],
    confidenceScore: 1,
    firstSeenAt: "2026-06-01T00:00:00.000Z",
    lastCheckedAt: "2026-06-01T00:00:00.000Z",
    ...partial,
  };
}

function follows(mode: ArtistFollowRules["mode"]): Map<string, ArtistFollowRules> {
  return new Map([["mbid-x", { priority: "normal", mode }]]);
}

describe("evaluateEventsForUser — only_new_tours batching", () => {
  it("one announcement wave in one batch yields exactly ONE notification", () => {
    const events = [
      event("e1", "2026-10-01"),
      event("e2", "2026-10-03"),
      event("e3", "2026-10-05"),
    ];
    const out = evaluateEventsForUser({
      userId: "u1",
      anchors: [HOME],
      events,
      followsByArtist: follows("only_new_tours"),
      prefs: {},
      now: new Date("2026-06-01T12:00:00Z"),
    });
    const notified = out.filter((r) => r.notification.notify);
    expect(notified).toHaveLength(1);
    expect(notified[0]!.event.id).toBe("e1");
  });

  it("does not batch-suppress other follow modes", () => {
    const events = [event("e1", "2026-10-01"), event("e2", "2026-10-03")];
    const out = evaluateEventsForUser({
      userId: "u1",
      anchors: [HOME],
      events,
      followsByArtist: follows("within_distance"),
      prefs: {},
      now: new Date("2026-06-01T12:00:00Z"),
    });
    expect(out.filter((r) => r.notification.notify)).toHaveLength(2);
  });
});

describe("evaluateEventsForUser — support-act follow rules", () => {
  it("applies the follower's rules when their artist is the SUPPORT act", () => {
    const coBilled = event("e1", "2026-10-01", {
      artistMbid: undefined,
      artistName: "Headliner B",
      supportActs: ["My Artist"],
    });
    const out = evaluateEventsForUser({
      userId: "u1",
      anchors: [HOME],
      events: [coBilled],
      followsByArtist: new Map([
        ["my artist", { priority: "normal", mode: "dashboard_only" }],
      ]),
      prefs: {},
      now: new Date("2026-06-01T12:00:00Z"),
    });
    // dashboard_only must be honoured — not silently replaced by defaults.
    expect(out[0]!.notification.notify).toBe(false);
    expect(out[0]!.notification.reason).toContain("dashboard");
  });
});
