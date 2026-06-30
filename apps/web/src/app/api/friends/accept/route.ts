import { z } from "zod";
import { apiUser, badRequest, json, notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({ friendshipId: z.string() });

/** POST /api/friends/accept — accept a pending invite (brief §11). */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("friendshipId required");

  const friendship = await prisma.friendship.findUnique({ where: { id: parsed.data.friendshipId } });
  if (!friendship || friendship.addresseeId !== user.id) return notFound();
  if (friendship.status !== "PENDING") return badRequest("not pending");

  const updated = await prisma.friendship.update({
    where: { id: friendship.id },
    data: { status: "ACCEPTED" },
  });
  return json({ friendship: updated });
}
