import "server-only";
import webpush from "web-push";
import { prisma } from "./prisma.js";
import { env, features } from "./env.js";

/** Web Push (VAPID) dispatch (brief §6.5). No-op when VAPID keys are absent. */

let configured = false;
function ensureConfigured(): boolean {
  if (!features.webPush) return false;
  if (!configured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    configured = true;
  }
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export async function sendWebPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;
  const devices = await prisma.userDevice.findMany({
    where: { userId, kind: "WEB_PUSH" },
  });
  await Promise.all(
    devices.map(async (d) => {
      if (!d.endpoint || !d.p256dh || !d.auth) return;
      try {
        await webpush.sendNotification(
          { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
          JSON.stringify(payload),
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.userDevice.delete({ where: { id: d.id } }).catch(() => undefined);
        }
      }
    }),
  );
}
