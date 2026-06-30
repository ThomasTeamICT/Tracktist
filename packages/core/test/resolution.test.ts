import { describe, expect, it } from "vitest";
import { NO_RATE_LIMIT } from "../src/providers/http.js";
import { MusicBrainzClient } from "../src/resolution/musicbrainz.js";
import { ArtistResolver } from "../src/resolution/artist-resolver.js";
import { buildSpikeFetch } from "./fixtures/spike-fetch.js";

const fetchImpl = buildSpikeFetch();

function resolver() {
  const mb = new MusicBrainzClient({
    userAgent: "Tracktist-Test/1.0 ( test@tracktist.app )",
    fetchImpl,
    rateLimiter: NO_RATE_LIMIT,
  });
  return new ArtistResolver(mb);
}

describe("ArtistResolver", () => {
  it("surfaces ranked candidates for an ambiguous name (disambiguation UI)", async () => {
    const candidates = await resolver().findCandidates("The National");
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates[0]!.name).toBe("The National");
    expect(candidates[0]!.mbid).toBe("mbid-the-national");
    expect(candidates[0]!.disambiguation).toContain("Cincinnati");
    // The decoy is present so the user can pick the right one.
    expect(candidates.some((c) => c.name === "The National Parks")).toBe(true);
  });

  it("resolves name → MBID → external ids (Spike 0)", async () => {
    const artist = await resolver().resolve("The National");
    expect(artist).not.toBeNull();
    expect(artist!.mbid).toBe("mbid-the-national");
    expect(artist!.externalIds.mbid).toBe("mbid-the-national");
    expect(artist!.externalIds.spotifyId).toBe("2cCUtGK9sDU2EvELDLpscX");
    expect(artist!.externalIds.officialWebsite).toBe("https://americanmary.com/");
    expect(artist!.genres).toContain("indie rock");
  });

  it("resolves Amenra to a Belgian MBID", async () => {
    const artist = await resolver().resolve("Amenra");
    expect(artist!.mbid).toBe("mbid-amenra");
    expect(artist!.country).toBe("BE");
  });

  it("refuses to auto-pick when the top matches are weak and close", async () => {
    const artist = await resolver().resolve("Halo");
    expect(artist).toBeNull(); // caller must show candidates instead
  });
});
