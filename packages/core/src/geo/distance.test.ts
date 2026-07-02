import { describe, expect, it } from "vitest";
import type { Anchor } from "../types/geo.js";
import {
  anchorAppliesOn,
  bestWithinRadius,
  distancesForEvent,
  haversineKm,
  isWithinRadius,
  roundKm,
} from "./distance.js";

// Reference coordinates.
const DENDERMONDE = { lat: 51.0259, lng: 4.1015 };
const AMSTERDAM = { lat: 52.3676, lng: 4.9041 }; // AFAS Live area
const PARIS = { lat: 48.8566, lng: 2.3522 };
const COLOGNE = { lat: 50.9375, lng: 6.9603 };
const NEW_YORK = { lat: 40.7128, lng: -74.006 };

describe("haversineKm", () => {
  it("is zero for identical points", () => {
    expect(haversineKm(DENDERMONDE, DENDERMONDE)).toBe(0);
  });

  it("is symmetric", () => {
    expect(haversineKm(DENDERMONDE, PARIS)).toBeCloseTo(
      haversineKm(PARIS, DENDERMONDE),
      6,
    );
  });

  // Known-good distances (great circle), tolerance a few km.
  it("matches known cross-border distances from Dendermonde", () => {
    expect(haversineKm(DENDERMONDE, AMSTERDAM)).toBeGreaterThan(140);
    expect(haversineKm(DENDERMONDE, AMSTERDAM)).toBeLessThan(170);
    expect(haversineKm(DENDERMONDE, PARIS)).toBeGreaterThan(250);
    expect(haversineKm(DENDERMONDE, PARIS)).toBeLessThan(290);
    expect(haversineKm(DENDERMONDE, COLOGNE)).toBeGreaterThan(190);
    expect(haversineKm(DENDERMONDE, COLOGNE)).toBeLessThan(220);
  });

  it("handles antipodal-ish long distances", () => {
    expect(haversineKm(DENDERMONDE, NEW_YORK)).toBeGreaterThan(5800);
  });
});

describe("isWithinRadius (border-agnostic)", () => {
  const anchor: Anchor = {
    label: "Thuis",
    location: DENDERMONDE,
    radiusKm: 300,
    active: true,
  };

  it("includes NL/FR/DE shows within 300 km even though they cross borders", () => {
    expect(isWithinRadius(anchor, AMSTERDAM)).toBe(true); // NL
    expect(isWithinRadius(anchor, PARIS)).toBe(true); // FR
    expect(isWithinRadius(anchor, COLOGNE)).toBe(true); // DE
  });

  it("excludes far-away shows", () => {
    expect(isWithinRadius(anchor, NEW_YORK)).toBe(false);
  });

  it("respects an overridden radius", () => {
    expect(isWithinRadius(anchor, PARIS, 100)).toBe(false);
    expect(isWithinRadius(anchor, AMSTERDAM, 100)).toBe(false);
  });
});

describe("roundKm", () => {
  it("rounds to one decimal", () => {
    expect(roundKm(166.6666)).toBe(166.7);
    expect(roundKm(166.62)).toBe(166.6);
  });
});

describe("anchorAppliesOn", () => {
  const travel: Anchor = {
    label: "Reis",
    location: PARIS,
    radiusKm: 100,
    active: true,
    startDate: "2026-07-01",
    endDate: "2026-07-15",
  };

  it("is false before the window and after it", () => {
    expect(anchorAppliesOn(travel, "2026-06-30")).toBe(false);
    expect(anchorAppliesOn(travel, "2026-07-16")).toBe(false);
  });

  it("is true inside the window and inclusive on bounds", () => {
    expect(anchorAppliesOn(travel, "2026-07-01")).toBe(true);
    expect(anchorAppliesOn(travel, "2026-07-10")).toBe(true);
    expect(anchorAppliesOn(travel, "2026-07-15")).toBe(true);
  });
});

describe("distancesForEvent", () => {
  const anchors: Anchor[] = [
    { id: "home", label: "Thuis", location: DENDERMONDE, radiusKm: 300, active: true },
    { id: "off", label: "Inactief", location: PARIS, radiusKm: 50, active: false },
  ];

  it("computes distance only for active anchors, closest first", () => {
    const results = distancesForEvent(
      { venue: { name: "AFAS Live", location: AMSTERDAM }, date: "2026-11-12" },
      anchors,
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.anchorId).toBe("home");
    expect(results[0]!.withinRadius).toBe(true);
  });

  it("returns empty when the venue has no coordinates", () => {
    const results = distancesForEvent(
      { venue: { name: "Unknown" }, date: "2026-11-12" },
      anchors,
    );
    expect(results).toEqual([]);
  });
});

describe("bestWithinRadius", () => {
  it("returns the closest qualifying anchor or null", () => {
    const anchors: Anchor[] = [
      { id: "home", label: "Thuis", location: DENDERMONDE, radiusKm: 300, active: true },
    ];
    const hit = bestWithinRadius(
      { venue: { name: "AFAS Live", location: AMSTERDAM }, date: "2026-11-12" },
      anchors,
    );
    expect(hit?.anchorId).toBe("home");

    const miss = bestWithinRadius(
      { venue: { name: "MSG", location: NEW_YORK }, date: "2026-11-12" },
      anchors,
    );
    expect(miss).toBeNull();
  });
});

describe("haversineKm — edge cases", () => {
  it("never returns NaN for (near-)antipodal points", () => {
    const km = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(Number.isNaN(km)).toBe(false);
    expect(km).toBeGreaterThan(20000);
  });
});
