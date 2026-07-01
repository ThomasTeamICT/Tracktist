import type { EvaluatedEvent } from "@tracktist/core";
import { isLowConfidence } from "@tracktist/core";
import { headlinerImageUrl, type DbEventWithRelations } from "./mappers.js";

/**
 * API serializers. The globe shape matches the brief §11 example response so
 * the frontend (and future native clients) read one stable contract.
 */

export interface GlobeEventDTO {
  eventId: string;
  artistName: string;
  artistImageUrl: string | null;
  date: string;
  startTime: string | null;
  venue: string;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
  distanceKm: number | null;
  withinRadius: boolean;
  ticketStatus: string;
  status: string;
  isFestival: boolean;
  confidenceScore: number;
  lowConfidence: boolean;
  relevance: number;
  hasTicketLink: boolean;
  sources: string[];
}

/** `dbEventId` is the real DB id; the canonical `event.id` is the dedupe key. */
export function toGlobeEvent(
  e: EvaluatedEvent,
  dbEventId: string,
  db?: DbEventWithRelations,
): GlobeEventDTO {
  return {
    eventId: dbEventId,
    artistName: e.event.artistName,
    artistImageUrl: db ? headlinerImageUrl(db) : null,
    date: e.event.date,
    startTime: e.event.startTime ?? null,
    venue: e.event.venue.name,
    city: e.event.venue.city ?? null,
    country: e.event.venue.country ?? null,
    countryCode: e.event.venue.countryCode ?? null,
    lat: e.event.venue.location?.lat ?? null,
    lng: e.event.venue.location?.lng ?? null,
    distanceKm: e.nearest?.distanceKm ?? null,
    withinRadius: e.withinRadius,
    ticketStatus: e.event.ticketStatus,
    status: e.event.status,
    isFestival: e.event.isFestival,
    confidenceScore: e.event.confidenceScore,
    lowConfidence: isLowConfidence(e.event.confidenceScore),
    relevance: e.relevance.total,
    hasTicketLink: e.event.sources.some((s) => Boolean(s.ticketUrl)),
    sources: e.event.sources.map((s) => s.provider),
  };
}
