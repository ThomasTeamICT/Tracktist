/**
 * Minimal, dependency-free HTTP helper for the provider + resolution layers.
 *
 * Provides the per-source rate limiting + exponential backoff that brief §5.2
 * requires. The `fetch` implementation, clock and sleep are injectable so the
 * whole pipeline is testable without network access (Spike 0 runs on
 * fixtures).
 */

export type FetchImpl = typeof fetch;

export interface HttpError extends Error {
  status?: number;
  url?: string;
}

/** Spaces requests at least `minIntervalMs` apart (token-bucket-lite). */
export class RateLimiter {
  private next = 0;
  constructor(
    private readonly minIntervalMs: number,
    private readonly clock: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {}

  static perSecond(rps: number): RateLimiter {
    return new RateLimiter(rps > 0 ? Math.ceil(1000 / rps) : 0);
  }

  async acquire(): Promise<void> {
    if (this.minIntervalMs <= 0) return;
    // Reserve the slot BEFORE sleeping — otherwise concurrent acquirers all
    // read the same `next`, sleep the same amount, and fire as one burst.
    const now = this.clock();
    const scheduled = Math.max(now, this.next);
    this.next = scheduled + this.minIntervalMs;
    const wait = scheduled - now;
    if (wait > 0) await this.sleep(wait);
  }
}

/** A no-op limiter for tests. */
export const NO_RATE_LIMIT = new RateLimiter(0);

export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchJsonOptions {
  fetchImpl?: FetchImpl;
  headers?: Record<string, string>;
  /** Per-request timeout. */
  timeoutMs?: number;
  /** Retry attempts on 429/5xx/network errors. */
  retries?: number;
  /** Base backoff; doubles each attempt (2s, 4s, 8s, …). */
  backoffMs?: number;
  rateLimiter?: RateLimiter;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * GET `url` and parse JSON, with rate limiting, timeout and exponential
 * backoff. Throws an {@link HttpError} on non-2xx after exhausting retries.
 */
export async function fetchJson<T = unknown>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<T> {
  const {
    fetchImpl = fetch,
    headers = {},
    timeoutMs = 10_000,
    retries = 3,
    backoffMs = 2000,
    rateLimiter = NO_RATE_LIMIT,
    sleep = defaultSleep,
    signal,
  } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Honour a caller abort that landed before this attempt (including
    // during a retry backoff sleep) — never start a new request after it.
    if (signal?.aborted) {
      throw lastError instanceof Error ? lastError : new Error("Aborted");
    }
    await rateLimiter.acquire();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const res = await fetchImpl(url, {
        headers: { accept: "application/json", ...headers },
        signal: controller.signal,
      });
      if (!res.ok) {
        // Drain the body so the connection can be reused/released (undici
        // keeps the socket pinned while an error body is unconsumed).
        await res.body?.cancel().catch(() => undefined);
        const err: HttpError = new Error(`HTTP ${res.status} for ${url}`);
        err.status = res.status;
        err.url = url;
        if (RETRYABLE.has(res.status) && attempt < retries) {
          lastError = err;
          await sleep(backoffMs * 2 ** attempt);
          continue;
        }
        throw err;
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      // A caller-initiated abort is final — never retry it.
      if (signal?.aborted) throw err;
      const isTimeout = err instanceof Error && err.name === "AbortError";
      // Retry transient network/timeout errors; rethrow HttpError already handled.
      if (attempt < retries && (isTimeout || !(err as HttpError).status)) {
        await sleep(backoffMs * 2 ** attempt);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Build a query string, skipping undefined/empty values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
