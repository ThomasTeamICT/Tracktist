import { z } from "zod";
import { apiUser, badRequest, json, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

/** POST /api/push/subscribe — store a Web Push subscription (brief §6.5). */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("invalid subscription");
  const { endpoint, keys } = parsed.data;

  const device = await prisma.userDevice.upsert({
    where: { endpoint },
    create: { userId: user.id, kind: "WEB_PUSH", endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth },
  });
  return json({ ok: true, deviceId: device.id }, { status: 201 });
}
