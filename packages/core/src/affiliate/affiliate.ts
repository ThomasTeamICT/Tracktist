import type { ProviderName } from "../types/event.js";

/**
 * Affiliate ticket-link wrapping (brief §8, B7).
 *
 * Every outgoing ticket link is wrapped with affiliate tracking, applied
 * SERVER-SIDE only — the publisher id never reaches the client. Ticketmaster
 * runs through an affiliate network (Impact / Sovrn); the exact link format is
 * program-specific, so wrapping is template-driven with a sensible default and
 * a per-click sub-id for conversion reconciliation. Correct attribution and
 * source crediting are mandatory (brief §14).
 */

export type AffiliateNetwork = "impact" | "sovrn" | "none";

export interface AffiliateConfig {
  /** Ticketmaster affiliate publisher id (Impact/Sovrn). Server-side only. */
  ticketmasterPublisherId?: string;
  network?: AffiliateNetwork;
  /**
   * Optional override template. Placeholders: {url} (encoded destination),
   * {rawUrl} (raw destination), {publisherId}, {subId}. When omitted, params
   * are merged into the destination URL.
   */
  template?: string;
}

export interface WrapResult {
  /** The URL to send the user to (wrapped when possible, else the raw URL). */
  url: string;
  /** Whether affiliate tracking was actually applied. */
  affiliated: boolean;
  /** Per-click id we generate for reconciliation. */
  subId: string;
}

/** A logged outgoing ticket-link click (brief §10 `AffiliateClick`). */
export interface AffiliateClick {
  id: string;
  subId: string;
  userId?: string;
  eventId: string;
  sourceProvider: ProviderName;
  rawUrl: string;
  wrappedUrl: string;
  affiliated: boolean;
  createdAt: string;
}

export interface WrapOptions {
  provider: ProviderName;
  rawUrl: string;
  config: AffiliateConfig;
  /** Stable per-click id; pass one for idempotency, else one is generated. */
  subId: string;
}

/**
 * Wrap a raw ticket URL for the given provider. Only Ticketmaster links are
 * affiliated in v1 and only when a publisher id is configured; everything else
 * passes through unchanged (but is still logged for attribution).
 */
export function wrapTicketUrl(opts: WrapOptions): WrapResult {
  const { provider, rawUrl, config, subId } = opts;
  const publisherId = config.ticketmasterPublisherId;

  if (provider !== "ticketmaster" || !publisherId || !isHttpUrl(rawUrl)) {
    return { url: rawUrl, affiliated: false, subId };
  }

  if (config.template) {
    const url = config.template
      .replaceAll("{url}", encodeURIComponent(rawUrl))
      .replaceAll("{rawUrl}", rawUrl)
      .replaceAll("{publisherId}", encodeURIComponent(publisherId))
      .replaceAll("{subId}", encodeURIComponent(subId));
    return { url, affiliated: true, subId };
  }

  // Default: merge Impact-style tracking params onto the destination URL.
  const url = applyParams(rawUrl, { camref: publisherId, pubref: subId });
  return { url, affiliated: true, subId };
}

/** Safely merge query parameters into a URL (existing params are preserved). */
export function applyParams(rawUrl: string, params: Record<string, string>): string {
  const u = new URL(rawUrl);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Deterministic sub-id from a click's identity, for idempotent logging. */
export function makeSubId(parts: { userId?: string; eventId: string; nonce?: string }): string {
  const base = [parts.userId ?? "anon", parts.eventId, parts.nonce ?? ""]
    .filter(Boolean)
    .join("-");
  return `tk_${base}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
}
