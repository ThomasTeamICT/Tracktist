import type { FetchImpl } from "../../src/providers/http.js";
import { stubFetch } from "./fetch-stub.js";
import {
  BIT_EVENTS_AMENRA,
  BIT_EVENTS_THE_NATIONAL,
  MB_LOOKUP_AMENRA,
  MB_LOOKUP_THE_NATIONAL,
  MB_SEARCH_AMBIGUOUS,
  MB_SEARCH_AMENRA,
  MB_SEARCH_THE_NATIONAL,
  TM_EVENTS_AMENRA,
  TM_EVENTS_THE_NATIONAL,
} from "./data.js";

/** Decode %xx and `+`, lowercase — for tolerant URL matching. */
export function urlContains(url: string, needle: string): boolean {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    /* keep raw */
  }
  return decoded.replace(/\+/g, " ").toLowerCase().includes(needle.toLowerCase());
}

const isMbSearch = (url: string) => url.includes("/artist?") || url.includes("/artist/?");
const isMbLookup = (url: string, mbid: string) => url.includes(`/artist/${mbid}`);
const isTm = (url: string) => url.includes("ticketmaster.com") && url.includes("events");
const isBit = (url: string) => url.includes("rest.bandsintown.com");

/**
 * A single offline `fetch` covering MusicBrainz, Ticketmaster and Bandsintown
 * for the Spike 0 artists. Returns 404 for anything unmapped.
 */
export function buildSpikeFetch(): FetchImpl {
  return stubFetch([
    // MusicBrainz lookups (most specific first).
    { match: (u) => isMbLookup(u, "mbid-the-national"), body: MB_LOOKUP_THE_NATIONAL },
    { match: (u) => isMbLookup(u, "mbid-amenra"), body: MB_LOOKUP_AMENRA },
    // MusicBrainz searches (query is a quoted Lucene phrase: artist:"name").
    {
      match: (u) => isMbSearch(u) && urlContains(u, 'artist:"the national"'),
      body: MB_SEARCH_THE_NATIONAL,
    },
    { match: (u) => isMbSearch(u) && urlContains(u, 'artist:"amenra"'), body: MB_SEARCH_AMENRA },
    { match: (u) => isMbSearch(u) && urlContains(u, 'artist:"halo'), body: MB_SEARCH_AMBIGUOUS },
    // Ticketmaster.
    { match: (u) => isTm(u) && urlContains(u, "the national"), body: TM_EVENTS_THE_NATIONAL },
    { match: (u) => isTm(u) && urlContains(u, "amenra"), body: TM_EVENTS_AMENRA },
    // Bandsintown.
    { match: (u) => isBit(u) && urlContains(u, "the national"), body: BIT_EVENTS_THE_NATIONAL },
    { match: (u) => isBit(u) && urlContains(u, "amenra"), body: BIT_EVENTS_AMENRA },
  ]);
}
