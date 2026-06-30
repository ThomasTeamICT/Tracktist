/**
 * Seed a demo account with data so the app is explorable without API keys.
 * Idempotent: safe to run repeatedly. Run with:
 *   node --conditions=react-server --import tsx prisma/seed.ts
 * (the react-server condition makes the `server-only` guards no-op under tsx).
 */
import type { CanonicalEvent, NormalizedEvent } from "@tracktist/core";
import { monitorArtist, ManualProvider } from "@tracktist/core";
import { prisma } from "../src/lib/prisma.js";
import { getOrCreateArtistFromCore } from "../src/lib/follow.js";
import { persistArtistEvents } from "../src/lib/sync.js";
import { notifyUser } from "../src/lib/notify.js";

const NOW = "2026-06-01T00:00:00.000Z";

function src(provider: NormalizedEvent["source"]["provider"], id: string, ticketUrl?: string) {
  return { provider, sourceId: id, url: `https://example.com/${id}`, ticketUrl, lastCheckedAt: NOW };
}

const NATIONAL_MBID = "b2f0e8c0-tracktist-demo-national";
const AMENRA_MBID = "a1d2e3f4-tracktist-demo-amenra";

const nationalEvents: NormalizedEvent[] = [
  {
    source: src("ticketmaster", "demo-natl-ams", "https://ticketmaster.com/demo-natl-ams"),
    artistMbid: NATIONAL_MBID, artistName: "The National", supportActs: ["This Is The Kit"],
    date: "2026-11-12", startTime: "20:00", venue: { name: "AFAS Live", city: "Amsterdam", country: "Netherlands", countryCode: "NL", location: { lat: 52.3122, lng: 4.9442 } },
    status: "tickets_available", ticketStatus: "available", isFestival: false,
  },
  {
    source: src("bandsintown", "demo-natl-ams-bit", "https://bandsintown.com/demo-natl-ams"),
    artistMbid: NATIONAL_MBID, artistName: "The National", supportActs: [],
    date: "2026-11-12", startTime: "20:00", venue: { name: "AFAS Live (Amsterdam)", city: "Amsterdam", country: "Netherlands", countryCode: "NL", location: { lat: 52.3125, lng: 4.9445 } },
    status: "tickets_available", ticketStatus: "available", isFestival: false,
  },
  {
    source: src("ticketmaster", "demo-natl-par", "https://ticketmaster.com/demo-natl-par"),
    artistMbid: NATIONAL_MBID, artistName: "The National", supportActs: [],
    date: "2026-11-15", startTime: "20:00", venue: { name: "Zénith Paris", city: "Paris", country: "France", countryCode: "FR", location: { lat: 48.8943, lng: 2.39 } },
    status: "tickets_available", ticketStatus: "available", isFestival: false,
  },
  {
    source: src("ticketmaster", "demo-natl-nyc"),
    artistMbid: NATIONAL_MBID, artistName: "The National", supportActs: [],
    date: "2026-12-01", startTime: "19:30", venue: { name: "Madison Square Garden", city: "New York", country: "United States", countryCode: "US", location: { lat: 40.7505, lng: -73.9934 } },
    status: "tickets_available", ticketStatus: "available", isFestival: false,
  },
];

const amenraEvents: NormalizedEvent[] = [
  {
    source: src("bandsintown", "demo-amen-gent", "https://bandsintown.com/demo-amen-gent"),
    artistMbid: AMENRA_MBID, artistName: "Amenra", supportActs: [],
    date: "2026-10-10", startTime: "20:00", venue: { name: "Vooruit", city: "Gent", country: "Belgium", countryCode: "BE", location: { lat: 51.0382, lng: 3.725 } },
    status: "tickets_available", ticketStatus: "available", isFestival: false,
  },
  {
    source: src("bandsintown", "demo-amen-til", "https://bandsintown.com/demo-amen-til"),
    artistMbid: AMENRA_MBID, artistName: "Amenra", supportActs: [],
    date: "2026-10-12", startTime: "19:30", venue: { name: "013", city: "Tilburg", country: "Netherlands", countryCode: "NL", location: { lat: 51.5606, lng: 5.0833 } },
    status: "sold_out", ticketStatus: "sold_out", isFestival: false,
  },
];

async function seedArtist(name: string, mbid: string, events: NormalizedEvent[]): Promise<string> {
  const artist = await getOrCreateArtistFromCore({
    id: mbid, mbid, name, genres: [], externalIds: { mbid },
  });
  const { events: canonical } = await monitorArtist({
    artist: { name, mbid, externalIds: { mbid } },
    providers: [new ManualProvider(events)],
    now: NOW,
  });
  await persistArtistEvents(artist.id, canonical as CanonicalEvent[]);
  return artist.id;
}

async function main() {
  console.log("Seeding demo data…");

  const user = await prisma.user.upsert({
    where: { email: "demo@tracktist.app" },
    create: { email: "demo@tracktist.app", name: "Demo Fan", preferredLanguage: "nl" },
    update: {},
  });

  await prisma.userLocation.upsert({
    where: { id: `${user.id}-home` },
    create: {
      id: `${user.id}-home`, userId: user.id, label: "Thuis (Dendermonde)",
      latitude: 51.0259, longitude: 4.1015, city: "Dendermonde", country: "Belgium",
      countryCode: "BE", radiusKm: 350, active: true,
    },
    update: { latitude: 51.0259, longitude: 4.1015, radiusKm: 350 },
  });

  await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, digest: false },
    update: {},
  });

  const nationalId = await seedArtist("The National", NATIONAL_MBID, nationalEvents);
  const amenraId = await seedArtist("Amenra", AMENRA_MBID, amenraEvents);

  for (const [artistId, priority] of [[nationalId, "HIGH"], [amenraId, "MUST_SEE"]] as const) {
    await prisma.userArtistFollow.upsert({
      where: { userId_artistId: { userId: user.id, artistId } },
      create: { userId: user.id, artistId, priority },
      update: { priority },
    });
  }

  const notif = await notifyUser(user.id);

  const events = await prisma.event.count();
  console.log(`✓ Seeded user demo@tracktist.app, 2 artists, ${events} events, notifications: ${notif.created} new.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
