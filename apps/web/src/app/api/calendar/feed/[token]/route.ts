import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getUserAgenda } from "@/lib/queries";
import { buildCalendarIcs, type IcsEvent } from "@/lib/ics";
import { formatDistance } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/calendar/feed/:token — the user's agenda as a subscribable
 * iCalendar feed (kalendersync). Calendar apps can't send cookies, so this
 * authenticates with a personal high-entropy token that the user can rotate
 * or revoke in settings at any time.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const integration = await prisma.calendarIntegration.findFirst({
    where: { provider: "ics-feed", accessToken: token },
    select: { userId: true },
  });
  if (!integration) return NextResponse.json({ error: "not found" }, { status: 404 });

  const agenda = await getUserAgenda(integration.userId);
  const events: IcsEvent[] = agenda
    .filter((a) => a.evaluated.event.status !== "cancelled")
    .map((a) => {
      const ev = a.evaluated.event;
      const distance = a.evaluated.nearest
        ? `Afstand: ${formatDistance(a.evaluated.nearest.distanceKm)}`
        : null;
      return {
        uid: a.db.id,
        title: `${ev.artistName} — ${ev.venue.city ?? ev.venue.name}`,
        date: ev.date,
        startTime: ev.startTime,
        venue: ev.venue.name,
        city: ev.venue.city,
        country: ev.venue.country,
        url: `${env.APP_BASE_URL}/events/${a.db.id}`,
        description: [distance, `Via Tracktist`].filter(Boolean).join(" · "),
      };
    });

  return new Response(buildCalendarIcs(events, "Tracktist — jouw shows"), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="tracktist.ics"',
      "cache-control": "private, max-age=900",
    },
  });
}
