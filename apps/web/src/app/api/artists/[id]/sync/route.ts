import { apiUser, json, serverError, unauthorized } from "@/lib/api";
import { syncArtist } from "@/lib/sync";

/** POST /api/artists/:id/sync — manually trigger a sync for one artist. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    const result = await syncArtist(id);
    return json({ ok: true, ...result });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : "sync failed");
  }
}
