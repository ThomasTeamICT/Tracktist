import { describe, expect, it } from "vitest";
import type { Anchor } from "../src/types/geo.js";
import type { ArtistFollowRules } from "../src/types/artist.js";
import type { EventProvider } from "../src/types/provider.js";
import { NO_RATE_LIMIT } from "../src/providers/http.js";
import { TicketmasterProvider } from "../src/providers/ticketmaster.provider.js";
import { BandsintownProvider } from "../src/providers/bandsintown.provider.js";
import { MusicBrainzClient } from "../src/resolution/musicbrainz.js";
import { ArtistResolver } from "../src/resolution/artist-resolver.js";
import { monitorArtist } from "../src/pipeline/monitor-artist.js";
import { evaluateEventsForUser } from "../src/pipeline/evaluate-for-user.js";
import { buildSpikeFetch, urlContains } from "./fixtures/spike-fetch.js";
import { FIXED_NOW, fixedNow } from "./fixtures/fetch-stub.js";

/**
 * Spike 0 acceptance (brief §13): for three real, awkward artists, prove
 * end-to-end (no UI) that name → MBID → external ids resolves, events come from
 * Ticketmaster AND Bandsintown, dedupe collapses them to canonical events, and
 * cross-border distance from a fixed Dendermonde anchor flags NL/FR/DE shows as
 * "within radius".
 */

const fetchImpl = buildSpikeFetch();
const DENDERMONDE = { lat: 51.0259, lng: 4.1015 };

// Evaluate against "now" just before the shows so date scoring is realistic.
const NOW_DATE = new Date("2026-09-01T00:00:00Z");

function makeProviders() {
  return [
    new TicketmasterProvider({ apiKey: "test", fetchImpl, rateLimiter: NO_RATE_LIMIT, now: fixedNow }),
    new BandsintownProvider({ appId: "tracktist.test", fetchImpl, rateLimiter: NO_RATE_LIMIT, now: fixedNow }),
  ];
}

function makeResolver() {
  return new ArtistResolver(
    new MusicBrainzClient({
      userAgent: "Tracktist-Test/1.0 ( test@tracktist.app )",
      fetchImpl,
      rateLimiter: NO_RATE_LIMIT,
    }),
  );
}

const anchor: Anchor = {
  id: "home",
  label: "Thuis (Dendermonde)",
  location: DENDERMONDE,
  radiusKm: 350,
  active: true,
};

describe("Spike 0 — The National (cross-border touring)", () => {
  it("resolves identity, fetches both sources, dedupes to canonical events", async () => {
    const artist = (await makeResolver().resolve("The National"))!;
    expect(artist.mbid).toBe("mbid-the-national");

    const result = await monitorArtist({
      artist: { name: artist.name, mbid: artist.mbid, externalIds: artist.externalIds },
      providers: makeProviders(),
      now: FIXED_NOW,
    });

    // Both providers returned events.
    const tmOutcome = result.perProvider.find((p) => p.provider === "ticketmaster")!;
    const bitOutcome = result.perProvider.find((p) => p.provider === "bandsintown")!;
    expect(tmOutcome.count).toBe(4);
    expect(bitOutcome.count).toBe(2);

    // 4 TM + 2 BIT = 6 raw, but Amsterdam appears in both → 5 canonical events.
    expect(result.events).toHaveLength(5);

    // Amsterdam merged across two sources with high confidence.
    const ams = result.events.find((e) => e.venue.city === "Amsterdam")!;
    expect(ams.sources).toHaveLength(2);
    expect(ams.sources.map((s) => s.provider).sort()).toEqual(["bandsintown", "ticketmaster"]);
    expect(ams.confidenceScore).toBeGreaterThanOrEqual(0.9);

    // External id backfilled from TM results (resolve once, cache — §4.3).
    expect(result.resolvedExternalIds.ticketmasterAttractionId).toBe("K8vZ917o7-0");

    // No duplicate canonical events.
    const keys = result.events.map((e) => e.id);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("flags NL/FR/DE shows as within radius from Dendermonde, NYC outside", async () => {
    const artist = (await makeResolver().resolve("The National"))!;
    const { events } = await monitorArtist({
      artist: { name: artist.name, mbid: artist.mbid, externalIds: artist.externalIds },
      providers: makeProviders(),
      now: FIXED_NOW,
    });

    const follows = new Map<string, ArtistFollowRules>([
      ["mbid-the-national", { priority: "high", mode: "within_distance" }],
    ]);
    const evaluated = evaluateEventsForUser({
      userId: "user-1",
      anchors: [anchor],
      events,
      followsByArtist: follows,
      prefs: { digest: false },
      now: NOW_DATE,
    });

    const byCity = (city: string) => evaluated.find((e) => e.event.venue.city === city)!;

    // Cross-border: the headline acceptance check.
    expect(byCity("Amsterdam").withinRadius).toBe(true); // NL
    expect(byCity("Paris").withinRadius).toBe(true); // FR
    expect(byCity("Köln").withinRadius).toBe(true); // DE
    expect(byCity("Brussels").withinRadius).toBe(true); // BE (BIT-only)
    expect(byCity("New York").withinRadius).toBe(false); // US, far

    // Distances are sane (great-circle from Dendermonde).
    expect(byCity("Amsterdam").nearest!.distanceKm).toBeGreaterThan(140);
    expect(byCity("Amsterdam").nearest!.distanceKm).toBeLessThan(170);
    expect(byCity("New York").nearest!.distanceKm).toBeGreaterThan(5000);

    // Notifications: within-radius shows notify; the far one does not.
    expect(byCity("Paris").notification.notify).toBe(true);
    expect(byCity("Paris").notification.type).toBe("new_show_nearby");
    expect(byCity("New York").notification.notify).toBe(false);

    // Idempotency: stable (user,event,anchor) dedupe keys.
    const keys = evaluated.map((e) => e.notification.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("Spike 0 — Amenra (smaller/indie act)", () => {
  it("dedupes the Tilburg show shared by TM and BIT", async () => {
    const artist = (await makeResolver().resolve("Amenra"))!;
    const result = await monitorArtist({
      artist: { name: artist.name, mbid: artist.mbid, externalIds: artist.externalIds },
      providers: makeProviders(),
      now: FIXED_NOW,
    });

    // TM: Tilburg only. BIT: Gent, Tilburg, Paris. Tilburg merges → 3 canonical.
    expect(result.events).toHaveLength(3);
    const tilburg = result.events.find((e) => e.venue.city === "Tilburg")!;
    expect(tilburg.sources).toHaveLength(2);

    const evaluated = evaluateEventsForUser({
      userId: "user-1",
      anchors: [anchor],
      events: result.events,
      followsByArtist: new Map([["mbid-amenra", { priority: "must_see", mode: "within_distance" }]]),
      prefs: { digest: false },
      now: NOW_DATE,
    });
    // Gent (~40 km), Tilburg (~95 km) and Paris (~272 km) are all within 350 km.
    expect(evaluated.every((e) => e.withinRadius)).toBe(true);
  });
});

describe("Spike 0 — ambiguous name", () => {
  it("does not silently resolve a weak, ambiguous match", async () => {
    const artist = await makeResolver().resolve("Halo");
    expect(artist).toBeNull();
    const candidates = await makeResolver().findCandidates("Halo");
    expect(candidates.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Spike 0 — provider fallback", () => {
  it("survives one provider throwing and still returns the other's events", async () => {
    // A provider that fails outright (after its own retries are exhausted);
    // the pipeline must fall back to the remaining sources (brief §5.2.7).
    const breaking: EventProvider = {
      name: "bandsintown",
      isEnabled: () => true,
      fetchEventsForArtist: async () => {
        throw new Error("network down");
      },
    };
    const tm = new TicketmasterProvider({ apiKey: "test", fetchImpl, rateLimiter: NO_RATE_LIMIT, now: fixedNow });

    const result = await monitorArtist({
      artist: { name: "The National", mbid: "mbid-the-national", externalIds: { mbid: "mbid-the-national" } },
      providers: [tm, breaking],
      now: FIXED_NOW,
    });
    expect(result.events.length).toBe(4); // only TM survived
    expect(result.perProvider.find((p) => p.provider === "bandsintown")!.ok).toBe(false);
    expect(result.perProvider.find((p) => p.provider === "bandsintown")!.error).toContain("network down");
  });
});

// Guard against an unused-import lint surprise in CI.
void urlContains;
