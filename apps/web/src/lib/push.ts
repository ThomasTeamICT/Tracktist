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

export interface WebPushDevice {
  id: string;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
}

/** The user's registered web-push devices (fetch once, send many). */
export async function getWebPushDevices(userId: string): Promise<WebPushDevice[]> {
  return prisma.userDevice.findMany({
    where: { userId, kind: "WEB_PUSH" },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
}

export interface PushSendResult {
  /** Devices we attempted (had a complete subscription). */
  attempted: number;
  /** Devices that accepted the push. */
  delivered: number;
}

/**
 * Send one payload to a pre-fetched device list; prunes dead subscriptions
 * (410/404). Returns delivery counts so callers can distinguish "delivered",
 * "nothing to deliver to" and "all sends failed transiently" — the retry
 * decision belongs to the caller.
 */
export async function sendWebPushToDevices(
  devices: WebPushDevice[],
  payload: PushPayload,
): Promise<PushSendResult> {
  if (!ensureConfigured()) return { attempted: 0, delivered: 0 };
  let attempted = 0;
  let delivered = 0;
  await Promise.all(
    devices.map(async (d) => {
      if (!d.endpoint || !d.p256dh || !d.auth) return;
      attempted++;
      try {
        await webpush.sendNotification(
          { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
          JSON.stringify(payload),
        );
        delivered++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.userDevice.delete({ where: { id: d.id } }).catch(() => undefined);
        }
      }
    }),
  );
  return { attempted, delivered };
}

export async function sendWebPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<PushSendResult> {
  if (!ensureConfigured()) return { attempted: 0, delivered: 0 };
  return sendWebPushToDevices(await getWebPushDevices(userId), payload);
}
