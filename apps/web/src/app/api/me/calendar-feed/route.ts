import { randomBytes } from "node:crypto";
import { apiUser, json, unauthorized } from "@/lib/api";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PROVIDER = "ics-feed";

function feedUrl(token: string): string {
  return `${env.APP_BASE_URL}/api/calendar/feed/${token}`;
}

/** GET /api/me/calendar-feed — the current feed URL, if one exists. */
export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const row = await prisma.calendarIntegration.findFirst({
    where: { userId: user.id, provider: PROVIDER },
    select: { accessToken: true },
  });
  return json({ url: row?.accessToken ? feedUrl(row.accessToken) : null });
}

/** POST /api/me/calendar-feed — create the feed, or rotate its token. */
export async function POST() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const token = randomBytes(24).toString("hex"); // 48 hex chars

  const existing = await prisma.calendarIntegration.findFirst({
    where: { userId: user.id, provider: PROVIDER },
    select: { id: true },
  });
  if (existing) {
    await prisma.calendarIntegration.update({
      where: { id: existing.id },
      data: { accessToken: token },
    });
  } else {
    await prisma.calendarIntegration.create({
      data: { userId: user.id, provider: PROVIDER, accessToken: token },
    });
  }
  return json({ url: feedUrl(token) }, { status: existing ? 200 : 201 });
}

/** DELETE /api/me/calendar-feed — revoke the feed entirely. */
export async function DELETE() {
  const user = await apiUser();
  if (!user) return unauthorized();
  await prisma.calendarIntegration.deleteMany({ where: { userId: user.id, provider: PROVIDER } });
  return json({ ok: true });
}
