/**
 * MVP backend integration test against the real Postgres + PostGIS database.
 * Proves the §16 acceptance path end-to-end through the actual server lib:
 * resolve/persist (with dedupe) → PostGIS nearby → per-user evaluation →
 * idempotent notifications.
 *
 * Run: node --conditions=react-server --import tsx scripts/integration-test.ts
 */
import type { CanonicalEvent, NormalizedEvent } from "@tracktist/core";
import { canonicalKey, ManualProvider, monitorArtist } from "@tracktist/core";
import { prisma } from "../src/lib/prisma.js";
import { getOrCreateArtistFromCore } from "../src/lib/follow.js";
import { persistArtistEvents } from "../src/lib/sync.js";
import { evaluateUserEvents, findNearbyEventIds, getUserAgenda } from "../src/lib/queries.js";
import { notifyUser, runWeeklyDigests } from "../src/lib/notify.js";

const TEST_MBID = "test-mbid-integration-national";
const TEST_EMAIL = "integration-test@tracktist.app";
const TEST_EMAIL_DIGEST = "integration-test-digest@tracktist.app";
const TEST_EMAIL_TOURS = "integration-test-tours@tracktist.app";
// UUID-shaped MBIDs — key-stability logic distinguishes mbid- vs name-keyed ids.
const R_MBID = "12345678-abcd-4000-8000-00000000000a"; // reschedule act
const S_MBID = "12345678-abcd-4000-8000-00000000000b"; // residency act
const B_MBID = "12345678-abcd-4000-8000-00000000000c"; // co-billed headliner
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
  await prisma.event.deleteMany({
    where: {
      OR: [
        { dedupeKey: { startsWith: TEST_MBID } },
        { dedupeKey: { startsWith: "12345678-abcd-4000-8000-" } },
        { venue: { name: { startsWith: "IT " } } },
      ],
    },
  });
  await prisma.artist.deleteMany({
    where: { OR: [{ mbid: { in: [TEST_MBID, R_MBID, S_MBID, B_MBID] } }, { name: { startsWith: "IT " } }] },
  });
  await prisma.user.deleteMany({
    where: { email: { in: [TEST_EMAIL, TEST_EMAIL_DIGEST, TEST_EMAIL_TOURS] } },
  });
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

  // 6. only_new_tours: a whole announcement wave = ONE notification
  const toursUser = await prisma.user.create({ data: { email: TEST_EMAIL_TOURS, name: "IT Tours" } });
  await prisma.userLocation.create({
    data: { userId: toursUser.id, label: "Thuis", latitude: 51.0259, longitude: 4.1015, countryCode: "BE", radiusKm: 350, active: true },
  });
  await prisma.userArtistFollow.create({
    data: { userId: toursUser.id, artistId: artist.id, priority: "NORMAL", notifyMode: "ONLY_NEW_TOURS" },
  });
  const toursRun = await notifyUser(toursUser.id);
  assert(toursRun.created === 1, "only_new_tours: 3 eligible shows in one wave → 1 notification");
  const toursAgain = await notifyUser(toursUser.id);
  assert(toursAgain.created === 0, "only_new_tours: rerun stays quiet (wave already announced)");

  // 7. weekly digest: bundle → summary row → idempotent per ISO week
  const digestUser = await prisma.user.create({ data: { email: TEST_EMAIL_DIGEST, name: "IT Digest" } });
  await prisma.userLocation.create({
    data: { userId: digestUser.id, label: "Thuis", latitude: 51.0259, longitude: 4.1015, countryCode: "BE", radiusKm: 350, active: true },
  });
  await prisma.userArtistFollow.create({ data: { userId: digestUser.id, artistId: artist.id, priority: "NORMAL" } });
  await prisma.notificationPreference.create({
    data: { userId: digestUser.id, digest: true, webPush: true, email: false, inApp: true },
  });
  await notifyUser(digestUser.id);
  const digestPending = await prisma.notification.count({
    where: { userId: digestUser.id, webPush: false, sentAt: null, type: { in: ["NEW_SHOW_NEARBY", "NEW_SHOW_MUST_SEE"] } },
  });
  assert(digestPending === 2, "digest mode parks rows without direct channels");
  await runWeeklyDigests();
  const digestRow = await prisma.notification.findFirst({ where: { userId: digestUser.id, type: "WEEKLY_DIGEST" } });
  assert(Boolean(digestRow), "weekly digest creates ONE summary notification");
  const bundled = await prisma.notification.count({
    where: { userId: digestUser.id, type: { in: ["NEW_SHOW_NEARBY", "NEW_SHOW_MUST_SEE"] }, sentAt: { not: null } },
  });
  assert(bundled === 2, "digest members marked delivered");
  await runWeeklyDigests();
  const digestRows = await prisma.notification.count({ where: { userId: digestUser.id, type: "WEEKLY_DIGEST" } });
  assert(digestRows === 1, "second digest run in the same ISO week is a no-op");

  // 8. lifecycle gating: cancellations only reach users who knew the show
  const paris = await prisma.event.findFirst({
    where: { dedupeKey: { startsWith: TEST_MBID }, venue: { city: "Paris" } },
  });
  await prisma.event.update({ where: { id: paris!.id }, data: { status: "CANCELLED", ticketStatus: "CANCELLED" } });
  await notifyUser(user.id); // user 1 WAS notified about Paris
  const cancelled = await prisma.notification.findFirst({ where: { userId: user.id, type: "CANCELLED" } });
  assert(Boolean(cancelled), "cancellation notifies the user who knew about the show");
  await notifyUser(toursUser.id); // tours user was only ever told about Amsterdam
  const toursCancelled = await prisma.notification.count({ where: { userId: toursUser.id, type: "CANCELLED" } });
  assert(toursCancelled === 0, "no cancellation alert for a user who never knew the show");

  // 9. reschedule: same provider sourceId, new date → same row, no duplicate
  const rArtist = await getOrCreateArtistFromCore({
    id: R_MBID, mbid: R_MBID, name: "IT Reschedule Act", genres: [], externalIds: { mbid: R_MBID },
  });
  const rEvent = (date: string): NormalizedEvent => ({
    source: s("ticketmaster", "it-resched-1", "https://tm/resched"),
    artistMbid: R_MBID, artistName: "IT Reschedule Act", supportActs: [], date,
    venue: { name: "IT Reschedule Hall", city: "Gent", country: "België", countryCode: "BE", location: { lat: 51.05, lng: 3.73 } },
    status: "rescheduled", ticketStatus: "unknown", isFestival: false,
  });
  const r1 = await monitorArtist({ artist: { name: "IT Reschedule Act", mbid: R_MBID, externalIds: { mbid: R_MBID } }, providers: [new ManualProvider([rEvent("2026-09-10")])], now: NOW });
  await persistArtistEvents(rArtist.id, r1.events);
  const r2 = await monitorArtist({ artist: { name: "IT Reschedule Act", mbid: R_MBID, externalIds: { mbid: R_MBID } }, providers: [new ManualProvider([rEvent("2026-09-18")])], now: NOW });
  await persistArtistEvents(rArtist.id, r2.events);
  const rRows = await prisma.event.findMany({ where: { artists: { some: { artistId: rArtist.id } } } });
  assert(rRows.length === 1, "reschedule re-attaches via sourceId — no duplicate row");
  assert(rRows[0]!.date.toISOString().startsWith("2026-09-18"), "rescheduled row carries the new date");

  // 10. residency split survives persistence (and heals a pre-merged row)
  const sArtist = await getOrCreateArtistFromCore({
    id: S_MBID, mbid: S_MBID, name: "IT Residency Act", genres: [], externalIds: { mbid: S_MBID },
  });
  const sVenue = { name: "IT Residency Hall", city: "Gent", country: "België", countryCode: "BE" as const, location: { lat: 51.05, lng: 3.73 } };
  // Simulate the pre-fix state: one merged row holding all three sources.
  const mergedBase = { artistMbid: S_MBID, artistName: "IT Residency Act", date: "2026-09-01", venue: sVenue };
  const merged: CanonicalEvent = {
    id: canonicalKey(mergedBase), ...mergedBase, supportActs: [], startTime: null,
    status: "announced", ticketStatus: "unknown", isFestival: false,
    sources: [s("ticketmaster", "it-res-n1"), s("ticketmaster", "it-res-n2"), s("bandsintown", "it-res-bit1")],
    confidenceScore: 0.9, firstSeenAt: NOW, lastCheckedAt: NOW,
  };
  await persistArtistEvents(sArtist.id, [merged]);
  const sNight = (id: string, provider: "ticketmaster" | "bandsintown", date: string): NormalizedEvent => ({
    source: s(provider, id), artistMbid: S_MBID, artistName: "IT Residency Act", supportActs: [],
    date, venue: sVenue, status: "announced", ticketStatus: "unknown", isFestival: false,
  });
  const residencyRun = async () => {
    const res = await monitorArtist({
      artist: { name: "IT Residency Act", mbid: S_MBID, externalIds: { mbid: S_MBID } },
      providers: [new ManualProvider([
        sNight("it-res-n1", "ticketmaster", "2026-09-01"),
        sNight("it-res-n2", "ticketmaster", "2026-09-02"),
        sNight("it-res-bit1", "bandsintown", "2026-09-01"),
      ])],
      now: NOW,
    });
    assert(res.events.length === 2, "residency: 3 records dedupe to 2 nights (not 1, not 3)");
    await persistArtistEvents(sArtist.id, res.events);
    return prisma.event.findMany({
      where: { artists: { some: { artistId: sArtist.id } } },
      include: { sources: true }, orderBy: { date: "asc" },
    });
  };
  const sRows1 = await residencyRun();
  assert(sRows1.length === 2, "residency persists as 2 rows (pre-merged row healed)");
  assert(sRows1[0]!.sources.length === 2 && sRows1[1]!.sources.length === 1, "sources land on the right night");
  const keysBefore = sRows1.map((r) => r.dedupeKey).join(",");
  const sRows2 = await residencyRun();
  assert(sRows2.length === 2 && sRows2.map((r) => r.dedupeKey).join(",") === keysBefore, "re-sync is stable: same 2 rows, same keys (no flip-flop)");

  // 11. co-billed show: key never downgrades, support act linked correctly
  const bArtist = await getOrCreateArtistFromCore({
    id: B_MBID, mbid: B_MBID, name: "IT Headliner B", genres: [], externalIds: { mbid: B_MBID },
  });
  const aArtist = await getOrCreateArtistFromCore({
    id: "name:it-support-a", name: "IT Support A", genres: [], externalIds: {},
  });
  const cbVenue = { name: "IT Cobill Club", city: "Gent", country: "België", countryCode: "BE" as const, location: { lat: 51.05, lng: 3.73 } };
  const cbBase = { artistMbid: B_MBID, artistName: "IT Headliner B", date: "2026-09-20", venue: cbVenue };
  const asB: CanonicalEvent = {
    id: canonicalKey(cbBase), ...cbBase, supportActs: ["IT Support A"], startTime: null,
    status: "announced", ticketStatus: "unknown", isFestival: false,
    sources: [s("ticketmaster", "it-cobill-1")], confidenceScore: 0.8, firstSeenAt: NOW, lastCheckedAt: NOW,
  };
  await persistArtistEvents(bArtist.id, [asB]);
  const cbBaseA = { artistMbid: undefined, artistName: "IT Headliner B", date: "2026-09-20", venue: cbVenue };
  const asA: CanonicalEvent = { ...asB, id: canonicalKey(cbBaseA), artistMbid: undefined };
  await persistArtistEvents(aArtist.id, [asA]);
  const cbRows = await prisma.event.findMany({
    where: { venue: { name: "IT Cobill Club" } }, include: { artists: true },
  });
  assert(cbRows.length === 1, "co-billed syncs share one event row");
  assert(cbRows[0]!.dedupeKey === asB.id, "MBID-keyed dedupe key survives the support act's sync (no flip-flop)");
  const links = cbRows[0]!.artists;
  assert(
    links.find((l) => l.artistId === bArtist.id)?.headliner === true &&
      links.find((l) => l.artistId === aArtist.id)?.headliner === false,
    "headliner flags are correct for both linked artists",
  );

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
