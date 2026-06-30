import { apiUser, json, notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/** POST /api/notifications/:id/read — mark a notification read (brief §11). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const existing = await prisma.notification.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) return notFound();
  const updated = await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  return json({ notification: updated });
}
