import "server-only";
import { createHash } from "node:crypto";
import { makeSubId, wrapTicketUrl } from "@tracktist/core";
import { prisma } from "./prisma.js";
import { affiliateConfig } from "./integrations.js";
import { fromDbProvider } from "./mappers.js";

/**
 * Resolve the affiliate-wrapped outgoing ticket link for an event and log the
 * click (brief §8, §11 `/api/events/:id/ticket-link`). Wrapping happens
 * server-side with the publisher id; the click is logged idempotently on a
 * deterministic sub-id so a user re-clicking the same event isn't double-counted.
 */
export async function resolveTicketLink(
  eventId: string,
  userId?: string,
): Promise<{ url: string } | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { sources: true },
  });
  if (!event) return null;

  // Prefer a Ticketmaster source with a ticket URL (affiliate-eligible), then
  // any source that carries one.
  const sources = [...event.sources].sort((a, b) => {
    const score = (p: string, url: string | null) => (url ? 1 : 0) + (p === "TICKETMASTER" ? 2 : 0);
    return score(b.provider, b.ticketUrl) - score(a.provider, a.ticketUrl);
  });
  const chosen = sources.find((s) => s.ticketUrl) ?? sources[0];
  if (!chosen?.ticketUrl) return null;

  // Pseudonymize: the sub-id leaves our systems (affiliate network), so it
  // must never carry the raw internal user id. Deterministic per (user,event)
  // for idempotent click logging; reversible only via our own AffiliateClick row.
  const pseudo = userId
    ? createHash("sha256").update(`tracktist-subid:${userId}`).digest("hex").slice(0, 16)
    : undefined;
  const subId = makeSubId({ userId: pseudo, eventId });
  const wrapped = wrapTicketUrl({
    provider: fromDbProvider(chosen.provider),
    rawUrl: chosen.ticketUrl,
    config: affiliateConfig(),
    subId,
  });

  await prisma.affiliateClick.upsert({
    where: { subId },
    create: {
      subId,
      userId: userId ?? null,
      eventId: event.id,
      eventSourceId: chosen.id,
      provider: chosen.provider,
      rawUrl: chosen.ticketUrl,
      wrappedUrl: wrapped.url,
      affiliated: wrapped.affiliated,
    },
    update: { wrappedUrl: wrapped.url, affiliated: wrapped.affiliated },
  });

  return { url: wrapped.url };
}
