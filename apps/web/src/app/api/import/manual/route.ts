import { z } from "zod";
import type { CanonicalEvent } from "@tracktist/core";
import { canonicalKey } from "@tracktist/core";
import { apiUser, badRequest, forbidden, json, unauthorized } from "@/lib/api";
import { isAdminEmail } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { persistArtistEvents } from "@/lib/sync";

const schema = z.object({
  artistId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  venueName: z.string().min(1),
  city: z.string().optional(),
  country: z.string().optional(),
  countryCode: z.string().length(2).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  ticketUrl: z.string().url().optional(),
  isFestival: z.boolean().optional(),
});

/**
 * POST /api/import/manual — admin fallback for local/missing shows (brief §4.1).
 * Persisted through the same canonical pipeline so dedupe/relevance treat it
 * identically to provider data.
 *
 * Admin-only (ADMIN_EMAILS): manual events land in the SHARED event pool, so
 * an unrestricted endpoint would let any user inject fake shows — including
 * phishing ticket URLs — into everyone's agenda.
 */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (!isAdminEmail(user.email)) return forbidden("alleen voor beheerders");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("invalid manual event");
  const d = parsed.data;

  const artist = await prisma.artist.findUnique({ where: { id: d.artistId } });
  if (!artist) return badRequest("unknown artist");

  const now = new Date().toISOString();
  const base = {
    artistMbid: artist.mbid ?? undefined,
    artistName: artist.name,
    date: d.date,
    venue: {
      name: d.venueName,
      city: d.city,
      country: d.country,
      countryCode: d.countryCode,
      location: d.lat !== undefined && d.lng !== undefined ? { lat: d.lat, lng: d.lng } : undefined,
    },
  };
  const event: CanonicalEvent = {
    id: canonicalKey(base),
    ...base,
    supportActs: [],
    startTime: d.startTime ?? null,
    status: "announced",
    ticketStatus: d.ticketUrl ? "available" : "unknown",
    isFestival: d.isFestival ?? false,
    sources: [
      {
        provider: "manual",
        sourceId: `manual:${d.artistId}:${d.date}:${d.venueName}`,
        ticketUrl: d.ticketUrl,
        lastCheckedAt: now,
      },
    ],
    confidenceScore: 0.4,
    firstSeenAt: now,
    lastCheckedAt: now,
  };

  await persistArtistEvents(artist.id, [event]);
  return json({ ok: true, eventKey: event.id }, { status: 201 });
}
