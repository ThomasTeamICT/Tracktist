import type { EventProvider, EventQuery } from "../types/provider.js";
import type { NormalizedEvent } from "../types/event.js";
import type { FetchImpl } from "./http.js";

/**
 * setlist.fm — CONTEXT ONLY, not a core event source (brief §4.1, B3).
 *
 * setlist.fm carries historical setlists, not reliable upcoming on-sale data,
 * so it is inactive in v1 and never contributes notification candidates. It
 * implements {@link EventProvider} so it can be slotted in later (e.g. to
 * enrich past-event detail) without touching the rest of the system.
 */
export interface SetlistFmProviderOptions {
  apiKey?: string;
  fetchImpl?: FetchImpl;
}

export class SetlistFmProvider implements EventProvider {
  readonly name = "setlistfm" as const;
  private readonly apiKey?: string;

  constructor(opts: SetlistFmProviderOptions = {}) {
    this.apiKey = opts.apiKey;
  }

  /** Inactive in v1 regardless of key presence (context source only). */
  isEnabled(): boolean {
    return false;
  }

  async fetchEventsForArtist(_query: EventQuery): Promise<NormalizedEvent[]> {
    return [];
  }
}
