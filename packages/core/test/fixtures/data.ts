/**
 * Representative fixtures for Spike 0 (brief §13): three real, awkward artists —
 * The National (cross-border touring), Amenra (smaller/indie) and an ambiguous
 * name ("The National" vs "The National Parks"). Shapes mirror the real
 * Ticketmaster Discovery, Bandsintown Public and MusicBrainz WS/2 responses but
 * are hand-authored so the pipeline is provable without network or API keys.
 */

// ── MusicBrainz search/lookup ───────────────────────────────────────────────

export const MB_SEARCH_THE_NATIONAL = {
  artists: [
    {
      id: "mbid-the-national",
      name: "The National",
      "sort-name": "National, The",
      score: 100,
      country: "US",
      type: "Group",
      disambiguation: "US indie rock band from Cincinnati",
      tags: [
        { name: "indie rock", count: 12 },
        { name: "post-punk", count: 4 },
      ],
    },
    {
      id: "mbid-the-national-parks",
      name: "The National Parks",
      "sort-name": "National Parks, The",
      score: 73,
      country: "US",
      type: "Group",
      disambiguation: "American indie folk band from Provo, Utah",
      tags: [{ name: "indie folk", count: 5 }],
    },
  ],
};

export const MB_LOOKUP_THE_NATIONAL = {
  id: "mbid-the-national",
  name: "The National",
  "sort-name": "National, The",
  country: "US",
  disambiguation: "US indie rock band from Cincinnati",
  relations: [
    { type: "official homepage", url: { resource: "https://americanmary.com/" } },
    {
      type: "streaming",
      url: { resource: "https://open.spotify.com/artist/2cCUtGK9sDU2EvELDLpscX" },
    },
  ],
};

export const MB_SEARCH_AMENRA = {
  artists: [
    {
      id: "mbid-amenra",
      name: "Amenra",
      "sort-name": "Amenra",
      score: 100,
      country: "BE",
      type: "Group",
      disambiguation: "Belgian post-metal / sludge band",
      tags: [{ name: "post-metal", count: 9 }],
    },
  ],
};

export const MB_LOOKUP_AMENRA = {
  id: "mbid-amenra",
  name: "Amenra",
  country: "BE",
  relations: [
    { type: "official homepage", url: { resource: "https://church-of-ra.org/" } },
  ],
};

/** Two near-equal, non-exact candidates → resolver must NOT auto-pick one. */
export const MB_SEARCH_AMBIGUOUS = {
  artists: [
    {
      id: "mbid-ambi-a",
      name: "Halo",
      score: 64,
      disambiguation: "UK electronic act",
    },
    {
      id: "mbid-ambi-b",
      name: "Hālo",
      score: 61,
      disambiguation: "US metal band",
    },
  ],
};

// ── Ticketmaster Discovery ──────────────────────────────────────────────────

function tmEvent(opts: {
  id: string;
  name: string;
  date: string;
  time?: string;
  status: string;
  venue: string;
  city: string;
  countryName: string;
  countryCode: string;
  lat: number;
  lng: number;
  tz: string;
}) {
  return {
    id: opts.id,
    name: opts.name,
    url: `https://www.ticketmaster.com/event/${opts.id}`,
    dates: {
      start: { localDate: opts.date, localTime: opts.time ?? "20:00:00" },
      timezone: opts.tz,
      status: { code: opts.status },
    },
    priceRanges: [{ min: 45, max: 95, currency: "EUR" }],
    classifications: [{ segment: { name: "Music" }, genre: { name: "Rock" } }],
    _embedded: {
      attractions: [{ id: "K8vZ917o7-0", name: "The National" }],
      venues: [
        {
          name: opts.venue,
          city: { name: opts.city },
          country: { name: opts.countryName, countryCode: opts.countryCode },
          address: { line1: "1 Main St" },
          location: { latitude: String(opts.lat), longitude: String(opts.lng) },
          timezone: opts.tz,
        },
      ],
    },
  };
}

export const TM_EVENTS_THE_NATIONAL = {
  _embedded: {
    events: [
      tmEvent({
        id: "tm-natl-ams",
        name: "The National",
        date: "2026-11-12",
        status: "onsale",
        venue: "AFAS Live",
        city: "Amsterdam",
        countryName: "Netherlands",
        countryCode: "NL",
        lat: 52.3122,
        lng: 4.9442,
        tz: "Europe/Amsterdam",
      }),
      tmEvent({
        id: "tm-natl-par",
        name: "The National",
        date: "2026-11-15",
        status: "onsale",
        venue: "Zénith Paris - La Villette",
        city: "Paris",
        countryName: "France",
        countryCode: "FR",
        lat: 48.8943,
        lng: 2.39,
        tz: "Europe/Paris",
      }),
      tmEvent({
        id: "tm-natl-cgn",
        name: "The National",
        date: "2026-11-18",
        status: "onsale",
        venue: "Palladium",
        city: "Köln",
        countryName: "Germany",
        countryCode: "DE",
        lat: 50.9667,
        lng: 6.9833,
        tz: "Europe/Berlin",
      }),
      tmEvent({
        id: "tm-natl-nyc",
        name: "The National",
        date: "2026-12-01",
        status: "onsale",
        venue: "Madison Square Garden",
        city: "New York",
        countryName: "United States Of America",
        countryCode: "US",
        lat: 40.7505,
        lng: -73.9934,
        tz: "America/New_York",
      }),
    ],
  },
};

/** Amenra: Ticketmaster only has the Tilburg show (indie acts lean on BIT). */
export const TM_EVENTS_AMENRA = {
  _embedded: {
    events: [
      {
        id: "tm-amen-til",
        name: "Amenra",
        url: "https://www.ticketmaster.com/event/tm-amen-til",
        dates: {
          start: { localDate: "2026-10-12", localTime: "19:30:00" },
          timezone: "Europe/Amsterdam",
          status: { code: "onsale" },
        },
        _embedded: {
          attractions: [{ id: "K8vZ9000amen", name: "Amenra" }],
          venues: [
            {
              name: "013",
              city: { name: "Tilburg" },
              country: { name: "Netherlands", countryCode: "NL" },
              location: { latitude: "51.5606", longitude: "5.0833" },
              timezone: "Europe/Amsterdam",
            },
          ],
        },
      },
    ],
  },
};

// ── Bandsintown Public ──────────────────────────────────────────────────────

export const BIT_EVENTS_THE_NATIONAL = [
  {
    id: "bit-natl-ams",
    url: "https://www.bandsintown.com/e/bit-natl-ams",
    datetime: "2026-11-12T20:00:00", // same show as tm-natl-ams → must dedupe
    title: "The National at AFAS Live",
    lineup: ["The National", "This Is The Kit"],
    venue: {
      name: "AFAS Live (Amsterdam)",
      city: "Amsterdam",
      region: "Noord-Holland",
      country: "Netherlands",
      latitude: 52.3125,
      longitude: 4.9445,
    },
    offers: [
      { type: "Tickets", url: "https://www.bandsintown.com/t/bit-natl-ams", status: "available" },
    ],
  },
  {
    id: "bit-natl-bru",
    url: "https://www.bandsintown.com/e/bit-natl-bru",
    datetime: "2026-11-20T20:00:00", // BIT-only Brussels show, within radius
    title: "The National at Ancienne Belgique",
    lineup: ["The National"],
    venue: {
      name: "Ancienne Belgique",
      city: "Brussels",
      country: "Belgium",
      latitude: 50.8476,
      longitude: 4.3489,
    },
    offers: [
      { type: "Tickets", url: "https://www.bandsintown.com/t/bit-natl-bru", status: "available" },
    ],
  },
];

export const BIT_EVENTS_AMENRA = [
  {
    id: "bit-amen-gent",
    url: "https://www.bandsintown.com/e/bit-amen-gent",
    datetime: "2026-10-10T20:00:00",
    title: "Amenra at Vooruit",
    lineup: ["Amenra"],
    venue: {
      name: "Vooruit",
      city: "Gent",
      country: "Belgium",
      latitude: 51.0382,
      longitude: 3.725,
    },
    offers: [{ type: "Tickets", url: "https://bit/t/gent", status: "available" }],
  },
  {
    id: "bit-amen-til",
    url: "https://www.bandsintown.com/e/bit-amen-til",
    datetime: "2026-10-12T19:30:00", // same as tm-amen-til → must dedupe
    title: "Amenra at 013",
    lineup: ["Amenra"],
    venue: {
      name: "013 Poppodium",
      city: "Tilburg",
      country: "Netherlands",
      latitude: 51.5607,
      longitude: 5.0835,
    },
    offers: [{ type: "Tickets", url: "https://bit/t/til", status: "available" }],
  },
  {
    id: "bit-amen-par",
    url: "https://www.bandsintown.com/e/bit-amen-par",
    datetime: "2026-10-15T20:00:00",
    title: "Amenra at La Maroquinerie",
    lineup: ["Amenra", "Birds in Row"],
    venue: {
      name: "La Maroquinerie",
      city: "Paris",
      country: "France",
      latitude: 48.8698,
      longitude: 2.3897,
    },
    offers: [{ type: "Tickets", url: "https://bit/t/par", status: "sold out" }],
  },
];
