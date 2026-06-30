import { apiUser, json, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/notifications — the in-app notification centre (brief §6.5). */
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const unreadOnly = new URL(req.url).searchParams.get("unread") === "1";

  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return json({ notifications: items, unread });
}
