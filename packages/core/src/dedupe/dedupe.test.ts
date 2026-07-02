import { describe, expect, it } from "vitest";
import type { NormalizedEvent } from "../types/event.js";
import { canonicalKey, dedupeEvents, isSameEvent } from "./dedupe.js";

const AMSTERDAM = { lat: 52.3122, lng: 4.9442 };
const PARIS = { lat: 48.8566, lng: 2.3522 };

function ev(partial: Partial<NormalizedEvent> & {
  provider: NormalizedEvent["source"]["provider"];
  sourceId: string;
}): NormalizedEvent {
  const { provider, sourceId, source: sourceOverride, ...rest } = partial;
  return {
    artistMbid: "mbid-the-national",
    artistName: "The National",
    supportActs: [],
    date: "2026-11-12",
    startTime: "20:00",
    venue: { name: "AFAS Live", city: "Amsterdam", country: "Netherlands", countryCode: "NL", location: AMSTERDAM },
    status: "tickets_available",
    ticketStatus: "available",
    isFestival: false,
    ...rest,
    source: {
      provider,
      sourceId,
      lastCheckedAt: "2026-06-01T00:00:00.000Z",
      ...(sourceOverride ?? {}),
    },
  };
}

describe("isSameEvent", () => {
  it("merges the same show reported by TM and Bandsintown (brief §5.3 example)", () => {
    const tm = ev({
      provider: "ticketmaster",
      sourceId: "tm1",
      source: { provider: "ticketmaster", sourceId: "tm1", lastCheckedAt: "2026-06-01T00:00:00.000Z", ticketUrl: "https://tm/buy" },
    });
    const bit = ev({
      provider: "bandsintown",
      sourceId: "bit1",
      venue: { name: "AFAS Live (Amsterdam)", city: "Amsterdam", country: "Netherlands", countryCode: "NL", location: { lat: 52.3125, lng: 4.9445 } },
    });
    expect(isSameEvent(tm, bit)).toBe(true);
  });

  it("does not merge different dates", () => {
    const a = ev({ provider: "ticketmaster", sourceId: "a" });
    const b = ev({ provider: "bandsintown", sourceId: "b", date: "2026-11-20" });
    expect(isSameEvent(a, b)).toBe(false);
  });

  it("does not merge different cities even on the same date", () => {
    const a = ev({ provider: "ticketmaster", sourceId: "a" });
    const b = ev({
      provider: "bandsintown",
      sourceId: "b",
      venue: { name: "Olympia", city: "Paris", country: "France", countryCode: "FR", location: PARIS },
    });
    expect(isSameEvent(a, b)).toBe(false);
  });

  it("tolerates a one-day timezone shift when the venue matches", () => {
    const a = ev({ provider: "ticketmaster", sourceId: "a" });
    const b = ev({ provider: "bandsintown", sourceId: "b", date: "2026-11-13" });
    expect(isSameEvent(a, b)).toBe(true);
  });
});

describe("dedupeEvents", () => {
  it("collapses two sources into one canonical event with both sources", () => {
    const tm = ev({
      provider: "ticketmaster",
      sourceId: "tm1",
      source: { provider: "ticketmaster", sourceId: "tm1", lastCheckedAt: "2026-06-01T00:00:00.000Z", ticketUrl: "https://tm/buy" },
    });
    const bit = ev({
      provider: "bandsintown",
      sourceId: "bit1",
      venue: { name: "AFAS Live (Amsterdam)", city: "Amsterdam", country: "Netherlands", countryCode: "NL", location: { lat: 52.3125, lng: 4.9445 } },
    });
    const merged = dedupeEvents([tm, bit]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.sources).toHaveLength(2);
    expect(merged[0]!.confidenceScore).toBeGreaterThanOrEqual(0.9);
  });

  it("keeps genuinely distinct shows separate and sorts by date", () => {
    const ams = ev({ provider: "ticketmaster", sourceId: "tm1" });
    const par = ev({
      provider: "ticketmaster",
      sourceId: "tm2",
      date: "2026-11-05",
      venue: { name: "Olympia", city: "Paris", country: "France", countryCode: "FR", location: PARIS },
    });
    const merged = dedupeEvents([ams, par]);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.date).toBe("2026-11-05"); // Paris first (earlier)
    expect(merged[1]!.date).toBe("2026-11-12");
  });

  it("is idempotent on canonical key", () => {
    const a = ev({ provider: "ticketmaster", sourceId: "tm1" });
    const key1 = canonicalKey(dedupeEvents([a])[0]!);
    const key2 = canonicalKey(dedupeEvents([a, a])[0]!);
    expect(key1).toBe(key2);
  });

  it("keeps multi-night residencies apart (same venue, consecutive nights)", () => {
    // TM lists both nights; BIT lists night 1 with a day-shifted date. The
    // day tolerance would transitively glue everything into one cluster —
    // the residency split must keep two shows.
    const night1 = ev({ provider: "ticketmaster", sourceId: "tm-n1", date: "2026-11-12" });
    const night2 = ev({ provider: "ticketmaster", sourceId: "tm-n2", date: "2026-11-13" });
    const bitNight1 = ev({ provider: "bandsintown", sourceId: "bit-n1", date: "2026-11-12" });
    const merged = dedupeEvents([night1, night2, bitNight1]);
    expect(merged).toHaveLength(2);
    expect(merged.map((m) => m.date)).toEqual(["2026-11-12", "2026-11-13"]);
    expect(merged[0]!.sources).toHaveLength(2); // TM night 1 + BIT
  });

  it("still merges a genuine cross-source day shift (no same-provider pair)", () => {
    const tm = ev({ provider: "ticketmaster", sourceId: "tm1", date: "2026-11-12" });
    const bit = ev({ provider: "bandsintown", sourceId: "bit1", date: "2026-11-13" });
    expect(dedupeEvents([tm, bit])).toHaveLength(1);
  });

  it("lets cancelled status win across conflicting sources", () => {
    const ok = ev({ provider: "ticketmaster", sourceId: "tm1" });
    const cancelled = ev({
      provider: "bandsintown",
      sourceId: "bit1",
      status: "cancelled",
      ticketStatus: "cancelled",
      source: { provider: "bandsintown", sourceId: "bit1", lastCheckedAt: "2026-06-02T00:00:00.000Z" },
    });
    const merged = dedupeEvents([ok, cancelled]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.status).toBe("cancelled");
    expect(merged[0]!.ticketStatus).toBe("cancelled");
  });
});
