import type { Artist, ArtistCandidate } from "../types/artist.js";
import { normalizeName } from "../util/text.js";
import {
  MusicBrainzClient,
  officialWebsiteFromRelations,
  spotifyIdFromRelations,
  type MbArtist,
} from "./musicbrainz.js";

/**
 * Artist resolution (brief §4.3): turn a free-text name into a canonical
 * {@link Artist} keyed on its MusicBrainz MBID, surfacing disambiguation
 * candidates when the name is ambiguous ("The National" vs "The National
 * Parks"). Resolve once on add and cache.
 */
export class ArtistResolver {
  constructor(private readonly mb: MusicBrainzClient) {}

  /** Ranked candidates for a name, for the "which one did you mean?" UI. */
  async findCandidates(name: string, limit = 8): Promise<ArtistCandidate[]> {
    const results = await this.mb.searchArtists(name, limit);
    return results.map((a) => toCandidate(a, name)).sort((x, y) => y.score - x.score);
  }

  /**
   * Resolve to a single best Artist, enriched with URL relations (official
   * site, Spotify id). Returns null when nothing plausible is found.
   *
   * `autoAcceptThreshold` guards against silently picking a weak match; the
   * second-best gap matters too, so an ambiguous top pair stays unresolved and
   * should be confirmed by the user.
   */
  async resolve(
    name: string,
    opts: { autoAcceptThreshold?: number; minGap?: number } = {},
  ): Promise<Artist | null> {
    const { autoAcceptThreshold = 0.8, minGap = 0.1 } = opts;
    const candidates = await this.findCandidates(name);
    const best = candidates[0];
    if (!best || best.score < autoAcceptThreshold) return null;
    const second = candidates[1];
    if (second && best.score - second.score < minGap && !isExactName(best, name)) {
      // Too close to call automatically — let the caller disambiguate.
      return null;
    }
    return this.enrich(best);
  }

  /** Build a full Artist from a candidate, fetching URL relations. */
  async enrich(candidate: ArtistCandidate): Promise<Artist> {
    let website: string | undefined;
    let spotifyId: string | undefined;
    if (candidate.mbid) {
      try {
        const full = await this.mb.lookupArtist(candidate.mbid);
        website = officialWebsiteFromRelations(full.relations);
        spotifyId = spotifyIdFromRelations(full.relations);
      } catch {
        // Enrichment is best-effort; resolution still succeeds without it.
      }
    }
    return {
      id: candidate.mbid ?? `name:${normalizeName(candidate.name)}`,
      mbid: candidate.mbid,
      name: candidate.name,
      sortName: candidate.sortName,
      disambiguation: candidate.disambiguation,
      country: candidate.country,
      genres: candidate.genres,
      externalIds: {
        mbid: candidate.mbid,
        lastfmName: candidate.name,
        officialWebsite: website,
        spotifyId,
      },
    };
  }
}

function isExactName(c: ArtistCandidate, query: string): boolean {
  return normalizeName(c.name) === normalizeName(query);
}

function toCandidate(a: MbArtist, query: string): ArtistCandidate {
  // MusicBrainz score is 0..100; boost exact normalized-name matches.
  let score = (a.score ?? 0) / 100;
  if (normalizeName(a.name) === normalizeName(query)) score = Math.min(1, score + 0.15);
  return {
    mbid: a.id,
    name: a.name,
    sortName: a["sort-name"],
    disambiguation: a.disambiguation,
    country: a.country,
    genres: (a.tags ?? [])
      .slice()
      .sort((x, y) => y.count - x.count)
      .slice(0, 3)
      .map((t) => t.name),
    score: Math.round(score * 100) / 100,
    externalIds: { mbid: a.id },
  };
}
