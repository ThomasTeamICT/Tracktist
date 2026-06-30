import { apiUser, json, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const sel = { id: true, name: true, email: true, image: true } as const;

/** GET /api/friends — accepted friends + pending invites (brief §6.4). */
export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();

  const rows = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: user.id }, { addresseeId: user.id }] },
    include: { requester: { select: sel }, addressee: { select: sel } },
    orderBy: { createdAt: "desc" },
  });

  const accepted = rows
    .filter((r) => r.status === "ACCEPTED")
    .map((r) => ({ id: r.id, friend: r.requesterId === user.id ? r.addressee : r.requester }));
  const incoming = rows
    .filter((r) => r.status === "PENDING" && r.addresseeId === user.id)
    .map((r) => ({ id: r.id, from: r.requester }));
  const outgoing = rows
    .filter((r) => r.status === "PENDING" && r.requesterId === user.id)
    .map((r) => ({ id: r.id, to: r.addressee }));

  return json({ accepted, incoming, outgoing });
}
