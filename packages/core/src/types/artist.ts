/**
 * Artist identity (brief §4.3 — artist resolution layer).
 *
 * Never trust a name alone. The MusicBrainz MBID is the canonical key; every
 * external source id maps back to it. Resolve name → MBID → external ids once
 * when an artist is added and cache the mapping.
 */

export interface ArtistExternalIds {
  /** MusicBrainz ID — the canonical key. */
  mbid?: string;
  /** Ticketmaster Discovery "attraction" id. */
  ticketmasterAttractionId?: string;
  /** Bandsintown identifier (their API keys on the artist name or numeric id). */
  bandsintownId?: string;
  /** Spotify artist id (optional, only if available — see B1). */
  spotifyId?: string;
  /** Last.fm canonical artist name. */
  lastfmName?: string;
  /** setlist.fm musicbrainz-mbid (context only). */
  setlistfmId?: string;
  /** Official website URL. */
  officialWebsite?: string;
}

export interface Artist {
  /** Internal id; equals the MBID once resolved, otherwise a slug. */
  id: string;
  mbid?: string;
  name: string;
  sortName?: string;
  /** MusicBrainz disambiguation, e.g. "indie rock band from Cincinnati". */
  disambiguation?: string;
  /** ISO country code of origin, if known. */
  country?: string;
  genres?: string[];
  imageUrl?: string;
  externalIds: ArtistExternalIds;
}

/** A resolution candidate shown to the user when a name is ambiguous (§4.3, §6.2). */
export interface ArtistCandidate {
  mbid?: string;
  name: string;
  sortName?: string;
  disambiguation?: string;
  country?: string;
  genres?: string[];
  /** 0..1 match confidence from the resolver. */
  score: number;
  externalIds: ArtistExternalIds;
}

export type ArtistPriority = "low" | "normal" | "high" | "must_see";

/** Per-follow notification rules (brief §6.2). */
export interface ArtistFollowRules {
  priority: ArtistPriority;
  /** "always" ignores radius; "within_distance" is the default. */
  mode:
    | "always"
    | "within_distance"
    | "only_countries"
    | "only_new_tours"
    | "only_with_tickets"
    | "dashboard_only";
  /** ISO alpha-2 codes when mode === "only_countries". */
  countryCodes?: string[];
}
