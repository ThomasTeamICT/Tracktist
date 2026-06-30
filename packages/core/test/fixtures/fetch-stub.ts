import type { FetchImpl } from "../../src/providers/http.js";

export interface StubRoute {
  /** Return true if this route handles the given URL. */
  match: (url: string) => boolean;
  body: unknown;
  status?: number;
}

/**
 * A deterministic `fetch` replacement for tests/Spike 0. Matches the request
 * URL against the routes in order and returns a JSON {@link Response}. No
 * network, fully reproducible.
 */
export function stubFetch(routes: StubRoute[]): FetchImpl {
  return (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    const route = routes.find((r) => r.match(url));
    if (!route) {
      return new Response(JSON.stringify({ error: "no stub", url }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as FetchImpl;
}

/** Fixed clock for deterministic `lastCheckedAt` / confidence staleness. */
export const FIXED_NOW = "2026-06-01T00:00:00.000Z";
export const fixedNow = (): string => FIXED_NOW;
