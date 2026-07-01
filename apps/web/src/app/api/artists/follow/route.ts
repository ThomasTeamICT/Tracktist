import { z } from "zod";
import type { Artist as CoreArtist, ArtistPriority } from "@tracktist/core";
import { apiUser, badRequest, json, unauthorized } from "@/lib/api";
import { NextResponse } from "next/server";
import { followByName, followResolvedArtist } from "@/lib/follow";

const schema = z.object({
  name: z.string().min(1),
  mbid: z.string().optional(),
  sortName: z.string().optional(),
  disambiguation: z.string().optional(),
  country: z.string().optional(),
  genres: z.array(z.string()).optional(),
  priority: z.enum(["low", "normal", "high", "must_see"]).optional(),
});

/** POST /api/artists/follow — follow by resolved candidate (mbid) or by name. */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("invalid follow request");
  const d = parsed.data;
  const priority = (d.priority ?? "normal") as ArtistPriority;

  try {
    // With an MBID we can follow directly; otherwise resolve the name first.
    if (d.mbid) {
      const artist: CoreArtist = {
        id: d.mbid,
        mbid: d.mbid,
        name: d.name,
        sortName: d.sortName,
        disambiguation: d.disambiguation,
        country: d.country,
        genres: d.genres,
        externalIds: { mbid: d.mbid, lastfmName: d.name },
      };
      const result = await followResolvedArtist(user.id, artist, { priority });
      return json({ result }, { status: 201 });
    }

    const result = await followByName(user.id, d.name, { priority });
    if (!result) {
      return json(
        { error: "ambiguous", message: "Name is ambiguous; use /api/artists/search to pick a candidate." },
        { status: 409 },
      );
    }
    return json({ result }, { status: 201 });
  } catch (err) {
    // Artist resolution depends on MusicBrainz; a network/lookup failure must
    // not surface as an unhandled 500 with an empty body.
    return NextResponse.json(
      {
        error: "lookup_failed",
        message: "Kon de artiest nu niet opzoeken (metadatabron onbereikbaar). Probeer later opnieuw.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
