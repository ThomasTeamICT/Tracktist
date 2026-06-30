import { apiUser, json, unauthorized } from "@/lib/api";
import { unfollowArtist } from "@/lib/follow";

/** DELETE /api/artists/:id/follow — unfollow (brief §11). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await params;
  await unfollowArtist(user.id, id);
  return json({ ok: true });
}
