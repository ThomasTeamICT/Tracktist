import { apiUser, json, notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/** DELETE /api/friends/:id — remove a friend / decline an invite (brief §11). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const friendship = await prisma.friendship.findUnique({ where: { id } });
  if (!friendship || (friendship.requesterId !== user.id && friendship.addresseeId !== user.id)) {
    return notFound();
  }
  await prisma.friendship.delete({ where: { id } });
  return json({ ok: true });
}
