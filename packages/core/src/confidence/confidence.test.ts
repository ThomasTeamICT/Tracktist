import { describe, expect, it } from "vitest";
import {
  computeConfidence,
  isLowConfidence,
  type ConfidenceInput,
} from "./confidence.js";

const complete: ConfidenceInput = {
  sourceCount: 2,
  hasOfficialTicketLink: true,
  venueConfirmed: true,
  dateComplete: true,
  locationComplete: true,
  exactArtistIdMatch: true,
  hoursSinceChecked: 1,
  hasConflict: false,
};

describe("computeConfidence", () => {
  it("scores a fully-confirmed multi-source event very high", () => {
    expect(computeConfidence(complete)).toBeGreaterThanOrEqual(0.9);
  });

  it("scores a single-source but complete event in a solid mid-range", () => {
    const single = { ...complete, sourceCount: 1 };
    const score = computeConfidence(single);
    expect(score).toBeGreaterThan(0.6);
    expect(score).toBeLessThan(0.9);
  });

  it("penalises conflicts", () => {
    expect(computeConfidence({ ...complete, hasConflict: true })).toBeLessThan(
      computeConfidence(complete),
    );
  });

  it("penalises stale data", () => {
    expect(
      computeConfidence({ ...complete, hoursSinceChecked: 24 * 30 }),
    ).toBeLessThan(computeConfidence(complete));
  });

  it("scores a vague single-source fragment as low confidence", () => {
    const weak: ConfidenceInput = {
      sourceCount: 1,
      hasOfficialTicketLink: false,
      venueConfirmed: false,
      dateComplete: true,
      locationComplete: false,
      exactArtistIdMatch: false,
      hoursSinceChecked: 1,
      hasConflict: false,
    };
    expect(isLowConfidence(computeConfidence(weak))).toBe(true);
  });

  it("clamps to [0,1]", () => {
    const score = computeConfidence({ ...complete, hasConflict: true, hoursSinceChecked: 1e6 });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
