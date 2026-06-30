import { json } from "@/lib/api";
import { env, features } from "@/lib/env";

/** GET /api/push/public-key — VAPID public key for the browser to subscribe. */
export async function GET() {
  return json({ publicKey: features.webPush ? env.VAPID_PUBLIC_KEY : null });
}
