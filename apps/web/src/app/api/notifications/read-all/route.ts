import { apiUser, json, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/** POST /api/notifications/read-all — mark every unread notification read. */
export async function POST() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const result = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return json({ ok: true, marked: result.count });
}
