import type {
  CanonicalEvent,
  EventSourceRef,
  EventStatus,
  NormalizedEvent,
  TicketStatus,
} from "../types/event.js";
import { haversineKm } from "../geo/distance.js";
import { computeConfidence } from "../confidence/confidence.js";
import {
  normalizeName,
  normalizeVenue,
  similarity,
  tokenOverlap,
  venueSimilarity,
} from "../util/text.js";

export interface DedupeOptions {
  /** Min venue-name similarity to consider two venues the same. */
  venueThreshold: number;
  /** Max km between venue coordinates to treat as the same place. */
  geoToleranceKm: number;
  /** Max difference in calendar days (handles timezone day-shifts). */
  dayTolerance: number;
  /** "now" as an ISO timestamp, injected for deterministic tests. */
  now: string;
}

export const DEFAULT_DEDUPE_OPTIONS: DedupeOptions = {
  venueThreshold: 0.6,
  geoToleranceKm: 2,
  dayTolerance: 1,
  now: "1970-01-01T00:00:00.000Z",
};

const STATUS_SEVERITY: Record<EventStatus, number> = {
  cancelled: 5,
  rescheduled: 4,
  sold_out: 3,
  tickets_available: 2,
  announced: 1,
  past: 0,
};

function dayDiff(a: string, b: string): number {
  const da = Date.parse(a + "T00:00:00Z");
  const db = Date.parse(b + "T00:00:00Z");
  if (Number.isNaN(da) || Number.isNaN(db)) return Number.POSITIVE_INFINITY;
  return Math.abs(da - db) / 86_400_000;
}

function sameArtist(a: NormalizedEvent, b: NormalizedEvent): boolean {
  if (a.artistMbid && b.artistMbid) return a.artistMbid === b.artistMbid;
  const na = normalizeName(a.artistName);
  const nb = normalizeName(b.artistName);
  return similarity(na, nb) >= 0.85 || tokenOverlap(a.artistName, b.artistName) >= 0.6;
}

function coordsClose(
  a: NormalizedEvent,
  b: NormalizedEvent,
  toleranceKm: number,
): boolean {
  const la = a.venue.location;
  const lb = b.venue.location;
  if (!la || !lb) return false;
  return haversineKm(la, lb) <= toleranceKm;
}

function farApart(a: NormalizedEvent, b: NormalizedEvent): boolean {
  const la = a.venue.location;
  const lb = b.venue.location;
  if (!la || !lb) return false;
  return haversineKm(la, lb) > 50; // clearly different cities → never the same show
}

/**
 * Decide whether two normalized events describe the same physical show
 * (brief §5.3): same artist + close date + (matching venue OR same coords OR
 * same city). Contradicting coordinates (>50 km) veto a merge.
 */
export function isSameEvent(
  a: NormalizedEvent,
  b: NormalizedEvent,
  opts: DedupeOptions = DEFAULT_DEDUPE_OPTIONS,
): boolean {
  if (!sameArtist(a, b)) return false;
  if (dayDiff(a.date, b.date) > opts.dayTolerance) return false;
  if (farApart(a, b)) return false;

  if (venueSimilarity(a.venue.name, b.venue.name) >= opts.venueThreshold) return true;
  if (coordsClose(a, b, opts.geoToleranceKm)) return true;

  const cityA = a.venue.city ? normalizeName(a.venue.city) : "";
  const cityB = b.venue.city ? normalizeName(b.venue.city) : "";
  if (cityA && cityA === cityB && dayDiff(a.date, b.date) === 0) return true;

  return false;
}

/** Union-find for transitive clustering. */
class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root]!;
    while (this.parent[i] !== root) {
      const next = this.parent[i]!;
      this.parent[i] = root;
      i = next;
    }
    return root;
  }
  union(a: number, b: number): void {
    this.parent[this.find(a)] = this.find(b);
  }
}

function pickStatus(events: NormalizedEvent[]): {
  status: EventStatus;
  conflict: boolean;
} {
  const statuses = events.map((e) => e.status);
  if (statuses.includes("cancelled")) {
    return { status: "cancelled", conflict: hasStatusConflict(events) };
  }
  if (statuses.includes("rescheduled")) {
    return { status: "rescheduled", conflict: hasStatusConflict(events) };
  }
  // Otherwise trust the most recently checked source.
  const newest = [...events].sort((a, b) =>
    b.source.lastCheckedAt.localeCompare(a.source.lastCheckedAt),
  )[0]!;
  return { status: newest.status, conflict: hasStatusConflict(events) };
}

function hasStatusConflict(events: NormalizedEvent[]): boolean {
  const distinct = new Set(events.map((e) => STATUS_SEVERITY[e.status]));
  return distinct.size > 1;
}

function pickTicketStatus(events: NormalizedEvent[]): TicketStatus {
  if (events.some((e) => e.ticketStatus === "cancelled")) return "cancelled";
  const known = [...events]
    .filter((e) => e.ticketStatus !== "unknown")
    .sort((a, b) => b.source.lastCheckedAt.localeCompare(a.source.lastCheckedAt));
  return known[0]?.ticketStatus ?? "unknown";
}

function dedupeSources(events: NormalizedEvent[]): EventSourceRef[] {
  const seen = new Set<string>();
  const out: EventSourceRef[] = [];
  for (const e of events) {
    const key = `${e.source.provider}:${e.source.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e.source);
  }
  return out;
}

/** Deterministic canonical id from the merged event's identifying fields. */
export function canonicalKey(
  e: Pick<CanonicalEvent, "artistMbid" | "artistName" | "date" | "venue">,
): string {
  const artistKey = e.artistMbid ?? normalizeName(e.artistName);
  const venueKey =
    normalizeVenue(e.venue.name) ||
    (e.venue.city ? normalizeName(e.venue.city) : "") ||
    "unknown";
  return `${artistKey}|${e.date}|${venueKey}`;
}

function preferLonger(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a.length >= b.length ? a : b;
}

/** Provider priority for picking a stable cluster representative. */
const PROVIDER_ORDER: Record<string, number> = {
  ticketmaster: 0,
  bandsintown: 1,
  setlistfm: 2,
  manual: 3,
};

/** Build one canonical event from a cluster of same-event normalized records. */
export function mergeCluster(
  cluster: NormalizedEvent[],
  opts: DedupeOptions = DEFAULT_DEDUPE_OPTIONS,
): CanonicalEvent {
  // Representative = most complete (has coords, then most fields). Ties are
  // broken deterministically (provider order, then sourceId) so the same
  // cluster always yields the same canonical key across syncs.
  const rep = [...cluster].sort(
    (a, b) =>
      completeness(b) - completeness(a) ||
      (PROVIDER_ORDER[a.source.provider] ?? 9) - (PROVIDER_ORDER[b.source.provider] ?? 9) ||
      a.source.sourceId.localeCompare(b.source.sourceId),
  )[0]!;
  const sources = dedupeSources(cluster);

  const { status, conflict: statusConflict } = pickStatus(cluster);
  const ticketStatus = pickTicketStatus(cluster);

  const venue = {
    name: rep.venue.name,
    city: firstDefined(cluster.map((e) => e.venue.city)),
    country: firstDefined(cluster.map((e) => e.venue.country)),
    countryCode: firstDefined(cluster.map((e) => e.venue.countryCode)),
    address: firstDefined(cluster.map((e) => e.venue.address)),
    location: firstDefined(cluster.map((e) => e.venue.location)),
    timezone: firstDefined(cluster.map((e) => e.venue.timezone)),
  };

  const supportActs = unique(cluster.flatMap((e) => e.supportActs));
  const lastCheckedAt = maxIso(cluster.map((e) => e.source.lastCheckedAt));
  const firstSeenAt = minIso(cluster.map((e) => e.source.lastCheckedAt));
  const mbid = firstDefined(cluster.map((e) => e.artistMbid));

  const hasOfficialTicketLink = cluster.some((e) => Boolean(e.source.ticketUrl));
  const venueConfirmed = Boolean(venue.name && venue.location);
  const locationComplete = Boolean(venue.city && venue.country && venue.location);
  const exactArtistIdMatch = cluster.every((e) => Boolean(e.artistMbid));

  const dateConflict = new Set(cluster.map((e) => e.date)).size > 1;

  const confidenceScore = computeConfidence({
    sourceCount: sources.length,
    hasOfficialTicketLink,
    venueConfirmed,
    dateComplete: Boolean(rep.date),
    locationComplete,
    exactArtistIdMatch,
    hoursSinceChecked: hoursBetween(lastCheckedAt, opts.now),
    hasConflict: statusConflict || dateConflict,
  });

  const base = {
    artistMbid: mbid,
    artistName: rep.artistName,
    date: rep.date,
    venue,
  };

  return {
    id: canonicalKey(base),
    ...base,
    supportActs,
    title: preferLonger(
      firstDefined(cluster.map((e) => e.title)),
      rep.title,
    ),
    startTime: firstDefined(cluster.map((e) => e.startTime ?? undefined)) ?? null,
    timezone: venue.timezone,
    status,
    ticketStatus,
    priceRange: firstDefined(cluster.map((e) => e.priceRange)),
    isFestival: cluster.some((e) => e.isFestival),
    festivalName: firstDefined(cluster.map((e) => e.festivalName)),
    sources,
    confidenceScore,
    firstSeenAt,
    lastCheckedAt,
  };
}

/**
 * Deduplicate a flat list of normalized events into canonical events
 * (brief §5.3). O(n²) pairwise — fine because per-artist event counts are
 * small. Result is sorted by date ascending.
 */
export function dedupeEvents(
  events: NormalizedEvent[],
  opts: DedupeOptions = DEFAULT_DEDUPE_OPTIONS,
): CanonicalEvent[] {
  if (events.length === 0) return [];
  const uf = new UnionFind(events.length);
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      if (isSameEvent(events[i]!, events[j]!, opts)) uf.union(i, j);
    }
  }
  const clusters = new Map<number, NormalizedEvent[]>();
  for (let i = 0; i < events.length; i++) {
    const root = uf.find(i);
    const list = clusters.get(root) ?? [];
    list.push(events[i]!);
    clusters.set(root, list);
  }
  return [...clusters.values()]
    .flatMap(splitResidency)
    .map((cluster) => mergeCluster(cluster, opts))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Guard against multi-night residencies collapsing into one event: the day
 * tolerance (for cross-source timezone shifts) can transitively union two
 * consecutive nights at the same venue. But when a SINGLE provider lists
 * multiple distinct dates in one cluster, those are separate shows by
 * definition — re-split the cluster by date so no night is dropped.
 */
function splitResidency(cluster: NormalizedEvent[]): NormalizedEvent[][] {
  const dates = new Set(cluster.map((e) => e.date));
  if (dates.size <= 1) return [cluster];

  const datesPerProvider = new Map<string, Set<string>>();
  for (const e of cluster) {
    const set = datesPerProvider.get(e.source.provider) ?? new Set<string>();
    set.add(e.date);
    datesPerProvider.set(e.source.provider, set);
  }
  const isResidency = [...datesPerProvider.values()].some((s) => s.size > 1);
  if (!isResidency) return [cluster]; // genuine cross-source day-shift — keep merged

  const byDate = new Map<string, NormalizedEvent[]>();
  for (const e of cluster) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }
  return [...byDate.values()];
}

// ── helpers ────────────────────────────────────────────────────────────────

function completeness(e: NormalizedEvent): number {
  let score = 0;
  if (e.venue.location) score += 4;
  if (e.venue.city) score += 1;
  if (e.venue.country) score += 1;
  if (e.venue.address) score += 1;
  if (e.source.ticketUrl) score += 1;
  if (e.startTime) score += 1;
  return score;
}

function firstDefined<T>(values: (T | undefined)[]): T | undefined {
  for (const v of values) if (v !== undefined && v !== null) return v;
  return undefined;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function maxIso(values: string[]): string {
  return values.reduce((a, b) => (a > b ? a : b));
}

function minIso(values: string[]): string {
  return values.reduce((a, b) => (a < b ? a : b));
}

function hoursBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.abs(b - a) / 3_600_000;
}
