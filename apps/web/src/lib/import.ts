import "server-only";
import type { ArtistCandidate } from "@tracktist/core";
import { fetchJson, qs } from "@tracktist/core";
import { buildArtistResolver } from "./integrations.js";
import { followResolvedArtist } from "./follow.js";
import { env, features } from "./env.js";

/**
 * Artist import (brief §4.2). CSV / paste-bulk is the primary, dependency-free
 * path; Last.fm (open API) is secondary. Both resolve names to MBIDs and only
 * auto-follow confident matches — ambiguous names are returned for the user to
 * confirm.
 */

export interface ImportOutcome {
  followed: { name: string; artistId: string }[];
  ambiguous: { query: string; candidates: ArtistCandidate[] }[];
  notFound: string[];
}

export function parseArtistList(text: string): string[] {
  // Accept newline- or comma-separated lists; trim, dedupe, drop blanks.
  const raw = text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(raw)];
}

export async function importFromText(userId: string, text: string): Promise<ImportOutcome> {
  const names = parseArtistList(text).slice(0, 200); // safety cap
  return importNames(userId, names);
}

async function importNames(userId: string, names: string[]): Promise<ImportOutcome> {
  const resolver = buildArtistResolver();
  const outcome: ImportOutcome = { followed: [], ambiguous: [], notFound: [] };

  for (const name of names) {
    const artist = await resolver.resolve(name);
    if (artist) {
      const res = await followResolvedArtist(userId, artist, { sync: true });
      outcome.followed.push({ name: artist.name, artistId: res.artistId });
      continue;
    }
    // Couldn't auto-pick: surface candidates for confirmation, else not found.
    const candidates = await resolver.findCandidates(name, 5);
    if (candidates.length > 0) outcome.ambiguous.push({ query: name, candidates });
    else outcome.notFound.push(name);
  }
  return outcome;
}

interface LastfmTopArtists {
  topartists?: { artist?: { name?: string }[] };
}

/** Import a Last.fm user's top artists by username (brief §4.2). */
export async function importFromLastfm(
  userId: string,
  username: string,
  limit = 50,
): Promise<ImportOutcome> {
  if (!features.lastfm) {
    throw new Error("Last.fm import is not configured (LASTFM_API_KEY missing)");
  }
  const url =
    "https://ws.audioscrobbler.com/2.0/" +
    qs({
      method: "user.gettopartists",
      user: username,
      api_key: env.LASTFM_API_KEY,
      format: "json",
      limit,
    });
  const data = await fetchJson<LastfmTopArtists>(url);
  const names = (data.topartists?.artist ?? [])
    .map((a) => a.name)
    .filter((n): n is string => Boolean(n));
  return importNames(userId, names);
}
