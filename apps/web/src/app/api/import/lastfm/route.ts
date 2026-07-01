import { z } from "zod";
import { apiUser, badRequest, json, unauthorized } from "@/lib/api";
import { NextResponse } from "next/server";
import { importFromLastfm } from "@/lib/import";
import { features } from "@/lib/env";

const schema = z.object({ username: z.string().min(1), limit: z.number().int().min(1).max(200).optional() });

/** POST /api/import/lastfm — import a Last.fm user's top artists (brief §4.2). */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  // Not-configured is a client-actionable state, not a server error.
  if (!features.lastfm) {
    return NextResponse.json(
      { error: "not_configured", message: "Last.fm-import is niet geconfigureerd (LASTFM_API_KEY ontbreekt in .env)." },
      { status: 400 },
    );
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("username required");
  try {
    const outcome = await importFromLastfm(user.id, parsed.data.username, parsed.data.limit ?? 50);
    return json({ outcome });
  } catch (err) {
    // A genuine upstream/network failure (not config) → 502.
    return NextResponse.json(
      { error: "lastfm_failed", message: err instanceof Error ? err.message : "Last.fm import failed" },
      { status: 502 },
    );
  }
}
