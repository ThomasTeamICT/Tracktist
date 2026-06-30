import { apiUser, json, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/export — full personal-data export (GDPR, brief §14).
 * Returns everything tied to the account as a downloadable JSON file.
 */
export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();

  const data = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      locations: true,
      notificationPref: true,
      follows: { include: { artist: { select: { name: true, mbid: true } } } },
      lists: { include: { items: true } },
      notifications: true,
      devices: { select: { id: true, kind: true, userAgent: true, createdAt: true } },
      affiliateClicks: true,
      sentFriendships: true,
      receivedFriendships: true,
      groupMemberships: true,
    },
  });

  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="tracktist-export-${user.id}.json"`,
    },
  });
}
