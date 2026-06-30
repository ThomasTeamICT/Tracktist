import { apiUser, badRequest, json, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { findNearbyEventIds } from "@/lib/queries";
import { utcToIsoDate } from "@/lib/mappers";

export const dynamic = "force-dynamic";

/**
 * GET /api/events/nearby?lat=&lng=&radius= — PostGIS ST_DWithin lookup
 * (brief §7, §11). Falls back to the user's first active anchor when no
 * coordinates are supplied. Border-agnostic by design.
 */
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const url = new URL(req.url);

  let lat = numeric(url.searchParams.get("lat"));
  let lng = numeric(url.searchParams.get("lng"));
  let radiusKm = numeric(url.searchParams.get("radius")) ?? 150;

  if (lat === null || lng === null) {
    const anchor = await prisma.userLocation.findFirst({
      where: { userId: user.id, active: true },
      orderBy: { createdAt: "asc" },
    });
    if (!anchor) return badRequest("no coordinates and no active anchor");
    lat = anchor.latitude;
    lng = anchor.longitude;
    radiusKm = numeric(url.searchParams.get("radius")) ?? anchor.radiusKm;
  }

  const nearby = await findNearbyEventIds(lat, lng, radiusKm, {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  if (nearby.length === 0) return json({ events: [] });

  const distanceById = new Map(nearby.map((n) => [n.eventId, n.distanceKm]));
  const events = await prisma.event.findMany({
    where: { id: { in: nearby.map((n) => n.eventId) } },
    include: {
      venue: true,
      artists: { include: { artist: { select: { name: true } } }, where: { headliner: true }, take: 1 },
    },
  });

  const result = events
    .map((e) => ({
      eventId: e.id,
      artistName: e.artists[0]?.artist.name ?? "Unknown",
      date: utcToIsoDate(e.date),
      venue: e.venue.name,
      city: e.venue.city,
      country: e.venue.country,
      countryCode: e.venue.countryCode,
      distanceKm: distanceById.get(e.id) ?? null,
    }))
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

  return json({ center: { lat, lng, radiusKm }, events: result });
}

function numeric(v: string | null): number | null {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
