import { describe, expect, it } from "vitest";
import { NO_RATE_LIMIT } from "../src/providers/http.js";
import { TicketmasterProvider } from "../src/providers/ticketmaster.provider.js";
import { BandsintownProvider } from "../src/providers/bandsintown.provider.js";
import { buildSpikeFetch } from "./fixtures/spike-fetch.js";
import { fixedNow } from "./fixtures/fetch-stub.js";

const fetchImpl = buildSpikeFetch();

function tm() {
  return new TicketmasterProvider({
    apiKey: "test-key",
    fetchImpl,
    rateLimiter: NO_RATE_LIMIT,
    now: fixedNow,
  });
}
function bit() {
  return new BandsintownProvider({
    appId: "tracktist.test",
    fetchImpl,
    rateLimiter: NO_RATE_LIMIT,
    now: fixedNow,
  });
}

describe("TicketmasterProvider", () => {
  it("is disabled without an API key and returns no events", async () => {
    const p = new TicketmasterProvider({ fetchImpl });
    expect(p.isEnabled()).toBe(false);
    expect(await p.fetchEventsForArtist({ artistName: "The National" })).toEqual([]);
  });

  it("normalizes TM events including coordinates, country and ticket status", async () => {
    const events = await tm().fetchEventsForArtist({
      artistName: "The National",
      mbid: "mbid-the-national",
    });
    expect(events).toHaveLength(4);
    const ams = events.find((e) => e.venue.city === "Amsterdam")!;
    expect(ams.venue.name).toBe("AFAS Live");
    expect(ams.venue.countryCode).toBe("NL");
    expect(ams.venue.location).toEqual({ lat: 52.3122, lng: 4.9442 });
    expect(ams.date).toBe("2026-11-12");
    expect(ams.startTime).toBe("20:00");
    expect(ams.status).toBe("tickets_available");
    expect(ams.ticketStatus).toBe("available");
    expect(ams.source.provider).toBe("ticketmaster");
    expect(ams.source.ticketUrl).toContain("ticketmaster.com");
    expect(ams.artistMbid).toBe("mbid-the-national");
    expect(ams.priceRange).toEqual({ min: 45, max: 95, currency: "EUR" });
  });
});

describe("BandsintownProvider", () => {
  it("is disabled without an app id", async () => {
    const p = new BandsintownProvider({ fetchImpl });
    expect(p.isEnabled()).toBe(false);
    expect(await p.fetchEventsForArtist({ artistName: "Amenra" })).toEqual([]);
  });

  it("normalizes BIT events, lineup and offers", async () => {
    const events = await bit().fetchEventsForArtist({
      artistName: "The National",
      mbid: "mbid-the-national",
    });
    expect(events).toHaveLength(2);
    const ams = events.find((e) => e.venue.city === "Amsterdam")!;
    expect(ams.artistName).toBe("The National");
    expect(ams.supportActs).toContain("This Is The Kit");
    expect(ams.ticketStatus).toBe("available");
    const bru = events.find((e) => e.venue.city === "Brussels")!;
    expect(bru.venue.countryCode).toBe("BE");
  });

  it("maps sold-out offers", async () => {
    const events = await bit().fetchEventsForArtist({ artistName: "Amenra" });
    const paris = events.find((e) => e.venue.city === "Paris")!;
    expect(paris.ticketStatus).toBe("sold_out");
    expect(paris.status).toBe("sold_out");
  });
});
