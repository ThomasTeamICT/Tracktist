import { apiUser, badRequest, json, unauthorized } from "@/lib/api";
import { buildArtistResolver } from "@/lib/integrations";

export const dynamic = "force-dynamic";

/** GET /api/artists/search?q= — MusicBrainz-backed autocomplete (brief §6.2). */
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return badRequest("query too short");

  try {
    const candidates = await buildArtistResolver().findCandidates(q, 8);
    return json({ query: q, candidates });
  } catch (err) {
    return json({ query: q, candidates: [], error: err instanceof Error ? err.message : "search failed" });
  }
}
