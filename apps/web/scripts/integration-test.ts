/**
 * MVP backend integration test against the real Postgres + PostGIS database.
 * Proves the §16 acceptance path end-to-end through the actual server lib:
 * resolve/persist (with dedupe) → PostGIS nearby → per-user evaluation →
 * idempotent notifications.
 *
 * Run: node --conditions=react-server --import tsx scripts/integration-test.ts
 */
import type { NormalizedEvent } from "@tracktist/core";
import { ManualProvider, monitorArtist } from "@tracktist/core";
import { prisma } from "../src/lib/prisma.js";
import { getOrCreateArtistFromCore } from "../src/lib/follow.js";
import { persistArtistEvents } from "../src/lib/sync.js";
import { evaluateUserEvents, findNearbyEventIds, getUserAgenda } from "../src/lib/queries.js";
import { notifyUser } from "../src/lib/notify.js";

const TEST_MBID = "test-mbid-integration-national";
const TEST_EMAIL = "integration-test@tracktist.app";
const NOW = "2026-06-01T00:00:00.000Z";

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}

function s(provider: NormalizedEvent["source"]["provider"], id: string, ticket?: string) {
  return { provider, sourceId: id, ticketUrl: ticket, lastCheckedAt: NOW };
}

const events: NormalizedEvent[] = [
  { source: s("ticketmaster", "it-ams", "https://tm/it-ams"), artistMbid: TEST_MBID, artistName: "The National", supportActs: [], date: "2026-11-12", startTime: "20:00", venue: { name: "AFAS Live", city: "Amsterdam", country: "Netherlands", countryCode: "NL", location: { lat: 52.3122, lng: 4.9442 } }, status: "tickets_available", ticketStatus: "available", isFestival: false },
  { source: s("bandsintown", "it-ams-bit"), artistMbid: TEST_MBID, artistName: "The National", supportActs: [], date: "2026-11-12", venue: { name: "AFAS Live (Amsterdam)", city: "Amsterdam", country: "Netherlands", countryCode: "NL", location: { lat: 52.3125, lng: 4.9445 } }, status: "tickets_available", ticketStatus: "available", isFestival: false },
  { source: s("ticketmaster", "it-par", "https://tm/it-par"), artistMbid: TEST_MBID, artistName: "The National", supportActs: [], date: "2026-11-15", venue: { name: "Zénith Paris", city: "Paris", country: "France", countryCode: "FR", location: { lat: 48.8943, lng: 2.39 } }, status: "tickets_available", ticketStatus: "available", isFestival: false },
  { source: s("ticketmaster", "it-nyc"), artistMbid: TEST_MBID, artistName: "The National", supportActs: [], date: "2026-12-01", venue: { name: "MSG", city: "New York", country: "United States", countryCode: "US", location: { lat: 40.7505, lng: -73.9934 } }, status: "tickets_available", ticketStatus: "available", isFestival: false },
];

async function cleanup() {
  await prisma.event.deleteMany({ where: { dedupeKey: { startsWith: TEST_MBID } } });
  await prisma.artist.deleteMany({ where: { mbid: TEST_MBID } });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
}

async function main() {
  console.log("Integration test — full MVP backend against PostGIS\n");
  await cleanup();

  // 1. user + anchor (Dendermonde, 350 km)
  const user = await prisma.user.create({ data: { email: TEST_EMAIL, name: "IT" } });
  await prisma.userLocation.create({
    data: { userId: user.id, label: "Thuis", latitude: 51.0259, longitude: 4.1015, countryCode: "BE", radiusKm: 350, active: true },
  });

  // 2. resolve/persist with dedupe via the real pipeline
  const artist = await getOrCreateArtistFromCore({ id: TEST_MBID, mbid: TEST_MBID, name: "The National", genres: [], externalIds: { mbid: TEST_MBID } });
  const { events: canonical } = await monitorArtist({ artist: { name: "The National", mbid: TEST_MBID, externalIds: { mbid: TEST_MBID } }, providers: [new ManualProvider(events)], now: NOW });
  assert(canonical.length === 3, "4 source events dedupe to 3 canonical (Amsterdam merged)");
  await persistArtistEvents(artist.id, canonical);
  await prisma.userArtistFollow.create({ data: { userId: user.id, artistId: artist.id, priority: "HIGH" } });

  const persisted = await prisma.event.count({ where: { dedupeKey: { startsWith: TEST_MBID } } });
  assert(persisted === 3, "3 canonical events persisted");
  const ams = await prisma.event.findFirst({ where: { dedupeKey: { startsWith: TEST_MBID }, venue: { city: "Amsterdam" } }, include: { sources: true } });
  assert((ams?.sources.length ?? 0) === 2, "Amsterdam event has 2 sources");
  assert((ams?.confidenceScore ?? 0) >= 0.9, "merged Amsterdam event has high confidence");

  // 3. PostGIS nearby (cross-border, border-agnostic)
  const nearby = await findNearbyEventIds(51.0259, 4.1015, 350);
  const nearbyCities = new Set(
    (await prisma.event.findMany({ where: { id: { in: nearby.map((n) => n.eventId) } }, include: { venue: true } })).map((e) => e.venue.city),
  );
  assert(nearbyCities.has("Amsterdam") && nearbyCities.has("Paris"), "PostGIS: NL + FR shows within 350 km");
  assert(!nearbyCities.has("New York"), "PostGIS: New York excluded (too far)");

  // 4. per-user evaluation
  const evaluated = await evaluateUserEvents(user.id);
  const within = evaluated.filter((e) => e.withinRadius).map((e) => e.event.venue.city);
  assert(within.includes("Amsterdam") && within.includes("Paris"), "evaluation: NL + FR within radius");
  assert(!within.includes("New York"), "evaluation: New York outside radius");

  const agenda = await getUserAgenda(user.id);
  assert(agenda.length === 3 && agenda.every((a) => Boolean(a.db.id)), "agenda pairs evaluated events with DB ids");

  // 5. notifications: within-radius only, idempotent
  const first = await notifyUser(user.id);
  assert(first.created === 2, "2 notifications created (within-radius shows only)");
  const notifs = await prisma.notification.findMany({ where: { userId: user.id }, include: { event: { include: { venue: true } } } });
  assert(!notifs.some((n) => n.event?.venue.city === "New York"), "no notification for the far New York show");
  const second = await notifyUser(user.id);
  assert(second.created === 0 && second.updated === 0, "re-running notify is idempotent (no change → no re-notify)");

  await cleanup();
  console.log(`\n✅ Integration test passed (${passed} assertions).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("\n❌", err);
    await prisma.$disconnect();
    process.exit(1);
  });
