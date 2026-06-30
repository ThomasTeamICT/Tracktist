import "server-only";
import {
  ArtistResolver,
  BandsintownProvider,
  ManualProvider,
  MusicBrainzClient,
  RateLimiter,
  TicketmasterProvider,
  type AffiliateConfig,
  type EventProvider,
} from "@tracktist/core";
import { env } from "./env.js";

/**
 * Builds the live integration stack from server-side env (brief §4, §9).
 * Providers without keys are simply disabled; v1 keeps `ticketmaster` and
 * `bandsintown` active and `setlist.fm` as context only.
 */

// Shared rate limiters so all callers (web + worker) respect one budget per
// source (brief §5.2: ~2 req/s Ticketmaster, ~1 req/s MusicBrainz).
const tmLimiter = RateLimiter.perSecond(2);
const bitLimiter = RateLimiter.perSecond(2);
const mbLimiter = RateLimiter.perSecond(1);

export function buildEventProviders(): EventProvider[] {
  return [
    new TicketmasterProvider({ apiKey: env.TICKETMASTER_API_KEY, rateLimiter: tmLimiter }),
    new BandsintownProvider({ appId: env.BANDSINTOWN_APP_ID, rateLimiter: bitLimiter }),
    new ManualProvider(),
  ];
}

export function buildArtistResolver(): ArtistResolver {
  const mb = new MusicBrainzClient({
    userAgent: env.MUSICBRAINZ_USER_AGENT,
    rateLimiter: mbLimiter,
  });
  return new ArtistResolver(mb);
}

export function affiliateConfig(): AffiliateConfig {
  return {
    ticketmasterPublisherId: env.TICKETMASTER_AFFILIATE_PUBLISHER_ID,
    network: "impact",
  };
}
