import { z } from "zod";
import { apiUser, badRequest, json, notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({ email: z.string().email() });

/** POST /api/friends/invite — invite an existing user by email (brief §6.4). */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("valid email required");

  const target = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!target) return notFound("no Tracktist user with that email");
  if (target.id === user.id) return badRequest("cannot invite yourself");

  // Reuse any existing friendship in either direction.
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: user.id, addresseeId: target.id },
        { requesterId: target.id, addresseeId: user.id },
      ],
    },
  });
  if (existing) return json({ friendship: existing });

  const friendship = await prisma.friendship.create({
    data: { requesterId: user.id, addresseeId: target.id, status: "PENDING" },
  });
  return json({ friendship }, { status: 201 });
}
