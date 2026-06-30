import { z } from "zod";
import { apiUser, badRequest, json, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  groupId: z.string(),
  status: z.enum(["going", "maybe", "not"]),
});

const STATUS = { going: "GOING", maybe: "MAYBE", not: "NOT" } as const;

/** POST /api/events/:id/interest — set "ga/misschien/niet" within a group (brief §6.4). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id: eventId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("groupId and status required");
  const { groupId, status } = parsed.data;

  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
  });
  if (!member) return badRequest("not a member of this group");

  const interest = await prisma.groupEventInterest.upsert({
    where: { groupId_eventId_userId: { groupId, eventId, userId: user.id } },
    create: { groupId, eventId, userId: user.id, status: STATUS[status] },
    update: { status: STATUS[status] },
  });
  return json({ interest });
}
