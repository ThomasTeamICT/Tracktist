import { describe, expect, it } from "vitest";
import {
  levenshtein,
  normalizeName,
  normalizeVenue,
  similarity,
  tokenOverlap,
  venueSimilarity,
} from "./text.js";

describe("normalizeName", () => {
  it("strips diacritics, case and punctuation", () => {
    expect(normalizeName("Café De La Danse!")).toBe("cafe de la danse");
    expect(normalizeName("AC/DC")).toBe("ac dc");
  });
  it("expands ampersands", () => {
    expect(normalizeName("Simon & Garfunkel")).toBe("simon and garfunkel");
  });
});

describe("normalizeVenue", () => {
  it("drops parentheticals and venue stopwords", () => {
    expect(normalizeVenue("AFAS Live (Amsterdam)")).toBe("afas");
  });
  it("falls back to the normalized base when a name is all stopwords", () => {
    // Never collapse to an empty key — that would over-merge venues.
    expect(normalizeVenue("The Concert Hall")).toBe("the concert hall");
  });
});

describe("levenshtein", () => {
  it("computes edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("same", "same")).toBe(0);
  });
});

describe("similarity", () => {
  it("is 1 for identical, lower for different", () => {
    expect(similarity("afas", "afas")).toBe(1);
    expect(similarity("afas live", "afas")).toBeGreaterThan(0.4);
    expect(similarity("abc", "xyz")).toBeLessThan(0.1);
  });
});

describe("tokenOverlap", () => {
  it("is order-insensitive", () => {
    expect(tokenOverlap("AFAS Live Amsterdam", "Amsterdam AFAS Live")).toBe(1);
  });
});

describe("venueSimilarity", () => {
  it("treats cosmetic variants as the same venue", () => {
    expect(venueSimilarity("AFAS Live", "AFAS Live (Amsterdam)")).toBeGreaterThan(0.8);
    expect(venueSimilarity("Ancienne Belgique", "AB - Ancienne Belgique")).toBeGreaterThan(0.6);
  });
  it("separates genuinely different venues", () => {
    expect(venueSimilarity("AFAS Live", "Ziggo Dome")).toBeLessThan(0.5);
  });
});

describe("normalizeName — non-Latin scripts", () => {
  it("preserves Cyrillic and CJK instead of collapsing to empty", () => {
    expect(normalizeName("Кино")).toBe("кино");
    expect(normalizeName("東京事変")).toBe("東京事変");
    expect(normalizeName("Кино")).not.toBe(normalizeName("Аквариум"));
  });
});
