import { notFound } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { utcToIsoDate } from "@/lib/mappers";
import { buildEventIcs } from "@/lib/ics";

/** GET /api/events/:id/calendar — download an .ics file (brief §11). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      venue: true,
      artists: { include: { artist: { select: { name: true } } }, where: { headliner: true }, take: 1 },
    },
  });
  if (!event) return notFound("event not found");

  const artistName = event.artists[0]?.artist.name ?? event.title ?? "Concert";
  const ics = buildEventIcs({
    uid: event.id,
    title: `${artistName}${event.venue.city ? ` — ${event.venue.city}` : ""}`,
    date: utcToIsoDate(event.date),
    startTime: event.startTime,
    venue: event.venue.name,
    city: event.venue.city ?? undefined,
    country: event.venue.country ?? undefined,
    description: "Via Tracktist — your personal live-music radar.",
  });

  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="tracktist-${event.id}.ics"`,
    },
  });
}
