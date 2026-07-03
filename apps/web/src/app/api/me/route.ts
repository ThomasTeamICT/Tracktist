import { apiUser, json, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** DELETE /api/me — permanent account + data deletion (GDPR, brief §14). */
export async function DELETE() {
  const user = await apiUser();
  if (!user) return unauthorized();

  // One transaction: either the whole deletion (group handover, token purge,
  // affiliate scrub, user removal) lands, or none of it does — a crash
  // halfway must not leave a half-deleted account.
  await prisma.$transaction(async (tx) => {
    // Groups this user OWNS would cascade-delete, destroying other members'
    // shared data. Hand ownership to the longest-standing other member first;
    // only truly personal groups (no other members) go down with the account.
    const owned = await tx.group.findMany({
      where: { ownerId: user.id },
      include: {
        members: { where: { userId: { not: user.id } }, orderBy: { id: "asc" }, take: 1 },
      },
    });
    for (const group of owned) {
      const heir = group.members[0];
      if (heir) {
        await tx.group.update({ where: { id: group.id }, data: { ownerId: heir.userId } });
        await tx.groupMember.update({ where: { id: heir.id }, data: { role: "OWNER" } });
      }
    }

    // Auth.js verification tokens are keyed on the email, not the user row.
    if (user.email) {
      await tx.verificationToken.deleteMany({ where: { identifier: user.email } });
    }

    // Affiliate clicks survive for accounting (userId → null via SetNull), but
    // must not keep identifying material: scrub the URLs and re-key the sub-id.
    const clicks = await tx.affiliateClick.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    for (const c of clicks) {
      await tx.affiliateClick.update({
        where: { id: c.id },
        data: { subId: `deleted-${c.id}`, rawUrl: "", wrappedUrl: "" },
      });
    }

    // All remaining personal relations cascade from User (schema onDelete: Cascade).
    await tx.user.delete({ where: { id: user.id } });
  });
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
