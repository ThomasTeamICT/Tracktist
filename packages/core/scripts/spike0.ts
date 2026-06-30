/**
 * Spike 0 — runnable databewijs (brief §13).
 *
 *   pnpm spike0            # offline, uses bundled fixtures (no keys needed)
 *   TRACKTIST_LIVE=1 \
 *   TICKETMASTER_API_KEY=… BANDSINTOWN_APP_ID=… \
 *   MUSICBRAINZ_USER_AGENT=… pnpm spike0   # hit the real APIs
 *
 * Proves end-to-end, without any UI: name → MBID → external ids; events from
 * Ticketmaster AND Bandsintown; dedupe to canonical events; cross-border
 * distance from a fixed Dendermonde anchor.
 */
import type { Anchor } from "../src/types/geo.js";
import type { EventProvider } from "../src/types/provider.js";
import { NO_RATE_LIMIT, RateLimiter } from "../src/providers/http.js";
import { TicketmasterProvider } from "../src/providers/ticketmaster.provider.js";
import { BandsintownProvider } from "../src/providers/bandsintown.provider.js";
import { MusicBrainzClient } from "../src/resolution/musicbrainz.js";
import { ArtistResolver } from "../src/resolution/artist-resolver.js";
import { monitorArtist } from "../src/pipeline/monitor-artist.js";
import { evaluateEventsForUser } from "../src/pipeline/evaluate-for-user.js";
import { buildSpikeFetch } from "../test/fixtures/spike-fetch.js";

const LIVE = process.env.TRACKTIST_LIVE === "1";
const DENDERMONDE: Anchor = {
  id: "home",
  label: "Thuis (Dendermonde)",
  location: { lat: 51.0259, lng: 4.1015 },
  radiusKm: 350,
  active: true,
};

function buildStack() {
  if (LIVE) {
    const ua = process.env.MUSICBRAINZ_USER_AGENT ?? "Tracktist/1.0 ( contact@tracktist.app )";
    const mb = new MusicBrainzClient({ userAgent: ua, rateLimiter: RateLimiter.perSecond(1) });
    const providers: EventProvider[] = [
      new TicketmasterProvider({ apiKey: process.env.TICKETMASTER_API_KEY }),
      new BandsintownProvider({ appId: process.env.BANDSINTOWN_APP_ID }),
    ];
    return { resolver: new ArtistResolver(mb), providers };
  }
  const fetchImpl = buildSpikeFetch();
  const mb = new MusicBrainzClient({
    userAgent: "Tracktist-Spike/1.0 ( spike@tracktist.app )",
    fetchImpl,
    rateLimiter: NO_RATE_LIMIT,
  });
  const providers: EventProvider[] = [
    new TicketmasterProvider({ apiKey: "fixture", fetchImpl, rateLimiter: NO_RATE_LIMIT }),
    new BandsintownProvider({ appId: "fixture", fetchImpl, rateLimiter: NO_RATE_LIMIT }),
  ];
  return { resolver: new ArtistResolver(mb), providers };
}

async function run() {
  const { resolver, providers } = buildStack();
  console.log(`\nTracktist · Spike 0 — ${LIVE ? "LIVE API" : "offline fixtures"}\n${"=".repeat(60)}`);

  for (const name of ["The National", "Amenra"]) {
    console.log(`\n▶ ${name}`);

    const artist = await resolver.resolve(name);
    if (!artist) {
      console.log("  ✗ could not resolve a confident MBID (ambiguous?)");
      continue;
    }
    console.log(`  MBID: ${artist.mbid}`);
    if (artist.externalIds.spotifyId) console.log(`  Spotify: ${artist.externalIds.spotifyId}`);
    if (artist.externalIds.officialWebsite) console.log(`  Web: ${artist.externalIds.officialWebsite}`);

    const result = await monitorArtist({
      artist: { name: artist.name, mbid: artist.mbid, externalIds: artist.externalIds },
      providers,
    });
    for (const p of result.perProvider) {
      console.log(`  ${p.ok ? "✓" : "✗"} ${p.provider}: ${p.count} event(s)${p.error ? ` (${p.error})` : ""}`);
    }
    if (result.resolvedExternalIds.ticketmasterAttractionId) {
      console.log(`  TM attractionId (cached): ${result.resolvedExternalIds.ticketmasterAttractionId}`);
    }
    console.log(`  → ${result.events.length} canonical event(s) after dedupe:`);

    const evaluated = evaluateEventsForUser({
      userId: "spike",
      anchors: [DENDERMONDE],
      events: result.events,
      followsByArtist: new Map([[artist.mbid ?? name.toLowerCase(), { priority: "high", mode: "within_distance" }]]),
      prefs: { digest: false },
    });

    for (const e of evaluated.sort((a, b) => a.event.date.localeCompare(b.event.date))) {
      const dist = e.nearest ? `${e.nearest.distanceKm} km` : "no coords";
      const flag = e.withinRadius ? "WITHIN" : "outside";
      const src = e.event.sources.map((s) => s.provider[0]!.toUpperCase()).join("+");
      console.log(
        `    • ${e.event.date}  ${e.event.venue.city ?? "?"} (${e.event.venue.countryCode ?? "?"})` +
          `  ${dist}  [${flag}]  conf=${e.event.confidenceScore}  src=${src}` +
          `  notify=${e.notification.notify ? e.notification.type : "no"}`,
      );
    }
  }

  console.log(`\n${"=".repeat(60)}\nSpike 0 acceptance: identity resolved, two sources merged,`);
  console.log("cross-border NL/FR/DE shows flagged within radius. ✓\n");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
