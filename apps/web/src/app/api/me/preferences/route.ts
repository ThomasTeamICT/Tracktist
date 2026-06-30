import { z } from "zod";
import { apiUser, badRequest, json, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  maxDistanceKm: z.number().int().positive().nullable().optional(),
  countryCodes: z.array(z.string().length(2)).optional(),
  onlyMustSee: z.boolean().optional(),
  noFestivals: z.boolean().optional(),
  onlyWeekends: z.boolean().optional(),
  onlyWithTicketLink: z.boolean().optional(),
  onlyIfFriendsFollow: z.boolean().optional(),
  digest: z.boolean().optional(),
  quietHoursStart: z.string().nullable().optional(),
  quietHoursEnd: z.string().nullable().optional(),
  webPush: z.boolean().optional(),
  email: z.boolean().optional(),
  inApp: z.boolean().optional(),
  preferredLanguage: z.string().optional(),
});

export async function PATCH(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("invalid preferences");
  const { preferredLanguage, ...prefs } = parsed.data;

  if (preferredLanguage) {
    await prisma.user.update({ where: { id: user.id }, data: { preferredLanguage } });
  }

  const updated = await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...prefs },
    update: prefs,
  });
  return json({ preferences: updated });
}
