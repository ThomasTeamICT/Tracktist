import { fetchJson, qs, RateLimiter, type FetchImpl } from "../providers/http.js";

/**
 * Thin MusicBrainz WS/2 client (brief §4.3). MusicBrainz is the source of the
 * canonical MBID and disambiguation. It enforces ~1 req/s and requires a
 * descriptive User-Agent with contact info (no API key).
 */

const DEFAULT_BASE_URL = "https://musicbrainz.org/ws/2";

export interface MusicBrainzOptions {
  /** Required by MusicBrainz: e.g. "Tracktist/1.0 ( contact@tracktist.app )". */
  userAgent: string;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
  rateLimiter?: RateLimiter;
}

export interface MbArtist {
  id: string; // MBID
  name: string;
  "sort-name"?: string;
  disambiguation?: string;
  country?: string;
  score?: number; // search relevance 0..100
  type?: string;
  tags?: { name: string; count: number }[];
  relations?: MbRelation[];
}

interface MbRelation {
  type?: string;
  url?: { resource?: string };
}

interface MbSearchResponse {
  artists?: MbArtist[];
}

export class MusicBrainzClient {
  private readonly userAgent: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImpl;
  private readonly rateLimiter: RateLimiter;

  constructor(opts: MusicBrainzOptions) {
    this.userAgent = opts.userAgent;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.rateLimiter = opts.rateLimiter ?? RateLimiter.perSecond(1);
  }

  private headers(): Record<string, string> {
    return { "user-agent": this.userAgent };
  }

  /** Search artists by name; results are ordered by MusicBrainz relevance. */
  async searchArtists(name: string, limit = 8): Promise<MbArtist[]> {
    // Quote the whole name as a phrase — unquoted, Lucene binds only the
    // first token to `artist:` ("The National" → artist:The AND National).
    const url =
      `${this.baseUrl}/artist` +
      qs({ query: `artist:"${escapeLucenePhrase(name)}"`, fmt: "json", limit });
    const data = await fetchJson<MbSearchResponse>(url, {
      fetchImpl: this.fetchImpl,
      rateLimiter: this.rateLimiter,
      headers: this.headers(),
    });
    return data.artists ?? [];
  }

  /** Look up one artist with URL relations (official site, streaming links). */
  async lookupArtist(mbid: string): Promise<MbArtist> {
    const url = `${this.baseUrl}/artist/${mbid}` + qs({ fmt: "json", inc: "url-rels tags" });
    return fetchJson<MbArtist>(url, {
      fetchImpl: this.fetchImpl,
      rateLimiter: this.rateLimiter,
      headers: this.headers(),
    });
  }
}

/** Extract a Spotify artist id from a MusicBrainz url relation, if present. */
export function spotifyIdFromRelations(relations: MbRelation[] | undefined): string | undefined {
  for (const rel of relations ?? []) {
    const resource = rel.url?.resource ?? "";
    const m = resource.match(/open\.spotify\.com\/artist\/([A-Za-z0-9]+)/);
    if (m) return m[1];
  }
  return undefined;
}

export function officialWebsiteFromRelations(
  relations: MbRelation[] | undefined,
): string | undefined {
  return (relations ?? []).find((r) => r.type === "official homepage")?.url?.resource;
}

/** Escape Lucene special characters in a MusicBrainz query term. */
export function escapeLucene(input: string): string {
  return input.replace(/([+\-!(){}\[\]^"~*?:\\/&|])/g, "\\$1");
}

/** Escape a value used inside a quoted Lucene phrase (only `"` and `\`). */
export function escapeLucenePhrase(input: string): string {
  return input.replace(/(["\\])/g, "\\$1");
}
