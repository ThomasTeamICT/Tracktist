import { fetchJson, qs } from "@tracktist/core";
import { apiUser, badRequest, json, unauthorized } from "@/lib/api";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: { country_code?: string; city?: string; town?: string; village?: string };
}

/**
 * GET /api/geocode?q= — light geocoding for anchors via OpenStreetMap Nominatim
 * (brief §4.4: geocoding stays out of the critical path; this is only used to
 * help a user pin a home/anchor location).
 */
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return badRequest("query too short");

  try {
    const results = await fetchJson<NominatimResult[]>(
      "https://nominatim.openstreetmap.org/search" + qs({ q, format: "json", limit: 5, addressdetails: 1 }),
      { headers: { "user-agent": env.MUSICBRAINZ_USER_AGENT } },
    );
    const places = results.map((r) => ({
      label: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
      city: r.address?.city ?? r.address?.town ?? r.address?.village,
      countryCode: r.address?.country_code?.toUpperCase(),
    }));
    return json({ places });
  } catch (err) {
    return json({ places: [], error: err instanceof Error ? err.message : "geocode failed" });
  }
}
