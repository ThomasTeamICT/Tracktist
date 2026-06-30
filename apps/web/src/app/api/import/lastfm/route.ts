import { z } from "zod";
import { apiUser, badRequest, json, serverError, unauthorized } from "@/lib/api";
import { importFromLastfm } from "@/lib/import";

const schema = z.object({ username: z.string().min(1), limit: z.number().int().min(1).max(200).optional() });

/** POST /api/import/lastfm — import a Last.fm user's top artists (brief §4.2). */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("username required");
  try {
    const outcome = await importFromLastfm(user.id, parsed.data.username, parsed.data.limit ?? 50);
    return json({ outcome });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : "Last.fm import failed");
  }
}
