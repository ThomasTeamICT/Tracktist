import type { EventProvider, EventQuery } from "../types/provider.js";
import type { NormalizedEvent } from "../types/event.js";

/**
 * Manual admin-import fallback (brief §4.1). Holds events entered by hand (for
 * local shows the APIs miss) keyed by artist MBID or normalized name, and
 * surfaces them through the same {@link EventProvider} seam as the live
 * sources so dedupe/relevance treat them identically.
 */
export class ManualProvider implements EventProvider {
  readonly name = "manual" as const;
  private readonly byKey = new Map<string, NormalizedEvent[]>();

  constructor(seed: NormalizedEvent[] = []) {
    for (const e of seed) this.add(e);
  }

  isEnabled(): boolean {
    return this.byKey.size > 0;
  }

  add(event: NormalizedEvent): void {
    const key = event.artistMbid ?? event.artistName.toLowerCase();
    const list = this.byKey.get(key) ?? [];
    list.push(event);
    this.byKey.set(key, list);
  }

  async fetchEventsForArtist(query: EventQuery): Promise<NormalizedEvent[]> {
    // Set: mbid and externalIds.mbid are usually the same key — without
    // dedupe every event would be returned twice.
    const keys = new Set(
      [query.mbid, query.externalIds?.mbid, query.artistName.toLowerCase()].filter(
        (k): k is string => Boolean(k),
      ),
    );
    const seen = new Set<NormalizedEvent>();
    const out: NormalizedEvent[] = [];
    for (const key of keys) {
      for (const e of this.byKey.get(key) ?? []) {
        if (!seen.has(e)) {
          seen.add(e);
          out.push(e);
        }
      }
    }
    let events = out;
    if (query.from) events = events.filter((e) => e.date >= query.from!);
    return events;
  }
}
