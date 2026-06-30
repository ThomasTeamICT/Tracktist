import { apiUser, json, serverError, unauthorized } from "@/lib/api";
import { notifyUser } from "@/lib/notify";

/** POST /api/notifications/run — (re)evaluate and generate the caller's notifications. */
export async function POST() {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const result = await notifyUser(user.id);
    return json({ ok: true, ...result });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : "notify failed");
  }
}
