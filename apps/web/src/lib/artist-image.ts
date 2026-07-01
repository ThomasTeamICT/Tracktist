import "server-only";
import { fetchJson, normalizeName, qs } from "@tracktist/core";

/**
 * Artist imagery (brief §12: modern, musical). Deezer's public API returns
 * artist photos without any key/auth, so we use it to enrich artists with a
 * real picture. Best-effort: any failure returns null and the UI falls back to
 * a generated gradient avatar. Attribution: images © Deezer/rights holders.
 */

interface DeezerArtistSearch {
  data?: {
    name?: string;
    picture_xl?: string;
    picture_big?: string;
    picture_medium?: string;
  }[];
}

// Deezer's "no photo" placeholder resolves to a known silhouette asset.
const PLACEHOLDER = /\/artist\/$|1000x1000-000000-80-0-0\.jpg$|\/images\/artist\/\//;

export async function fetchArtistImage(name: string): Promise<string | null> {
  const q = name.trim();
  if (!q) return null;
  try {
    const url = "https://api.deezer.com/search/artist" + qs({ q, limit: 3 });
    const data = await fetchJson<DeezerArtistSearch>(url, { timeoutMs: 6000, retries: 1 });
    const target = normalizeName(q);
    const match =
      (data.data ?? []).find((a) => a.name && normalizeName(a.name) === target) ??
      (data.data ?? [])[0];
    if (!match || !match.name || normalizeName(match.name) !== target) return null;
    const img = match.picture_xl || match.picture_big || match.picture_medium || null;
    if (!img || PLACEHOLDER.test(img)) return null;
    return img;
  } catch {
    return null;
  }
}
