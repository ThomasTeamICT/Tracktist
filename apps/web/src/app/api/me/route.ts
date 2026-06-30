import { apiUser, json, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** DELETE /api/me — permanent account + data deletion (GDPR, brief §14). */
export async function DELETE() {
  const user = await apiUser();
  if (!user) return unauthorized();
  // All personal relations cascade from User (see schema onDelete: Cascade).
  await prisma.user.delete({ where: { id: user.id } });
  return json({ ok: true, deleted: true });
}

export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const [me, preferences, anchors, followCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, email: true, image: true, preferredLanguage: true },
    }),
    prisma.notificationPreference.findUnique({ where: { userId: user.id } }),
    prisma.userLocation.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.userArtistFollow.count({ where: { userId: user.id } }),
  ]);
  return json({ user: me, preferences, anchors, followCount });
}
