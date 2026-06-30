import type { ArtistPriority } from "../types/artist.js";
import type { TicketStatus } from "../types/event.js";

/**
 * Relevance score (brief §7):
 *
 *   relevance = artist_priority + distance + ticket_availability
 *             + friend_interest + date
 *
 * Implemented as a transparent weighted sum in [0,1] with a breakdown, so the
 * UI can explain "why am I seeing this" and notifications can rank candidates.
 */

export interface RelevanceInput {
  priority: ArtistPriority;
  /** Distance to the nearest qualifying anchor (km); undefined if unknown. */
  distanceKm?: number;
  /** Radius of that anchor (km). */
  radiusKm?: number;
  ticketStatus: TicketStatus;
  friendCount: number;
  /** Whole days until the event (negative = past). */
  daysUntil: number;
}

export interface RelevanceBreakdown {
  priority: number;
  distance: number;
  ticketAvailability: number;
  friendInterest: number;
  date: number;
  total: number;
}

const WEIGHTS = {
  priority: 0.3,
  distance: 0.25,
  ticketAvailability: 0.15,
  friendInterest: 0.15,
  date: 0.15,
} as const;

const PRIORITY_SCORE: Record<ArtistPriority, number> = {
  low: 0.25,
  normal: 0.5,
  high: 0.8,
  must_see: 1,
};

const TICKET_SCORE: Record<TicketStatus, number> = {
  available: 1,
  presale: 0.85,
  unknown: 0.4,
  sold_out: 0.1,
  cancelled: 0,
};

function distanceScore(distanceKm?: number, radiusKm?: number): number {
  if (distanceKm === undefined) return 0.3; // unknown distance: neutral-ish
  const r = radiusKm && radiusKm > 0 ? radiusKm : 300;
  if (distanceKm <= 0) return 1;
  if (distanceKm >= r) return 0; // outside the radius contributes nothing here
  return 1 - distanceKm / r;
}

function dateScore(daysUntil: number): number {
  if (daysUntil < 0) return 0; // past
  if (daysUntil <= 3) return 0.8; // imminent — high but slightly below the sweet spot
  if (daysUntil <= 60) return 1; // plannable window
  if (daysUntil <= 180) return 0.6;
  return 0.3; // far future
}

function friendScore(count: number): number {
  if (count <= 0) return 0;
  return 1 - 1 / (1 + count); // 1→0.5, 3→0.75, diminishing
}

export function computeRelevance(input: RelevanceInput): RelevanceBreakdown {
  const priority = PRIORITY_SCORE[input.priority] * WEIGHTS.priority;
  const distance = distanceScore(input.distanceKm, input.radiusKm) * WEIGHTS.distance;
  const ticketAvailability = TICKET_SCORE[input.ticketStatus] * WEIGHTS.ticketAvailability;
  const friendInterest = friendScore(input.friendCount) * WEIGHTS.friendInterest;
  const date = dateScore(input.daysUntil) * WEIGHTS.date;
  const total =
    Math.round((priority + distance + ticketAvailability + friendInterest + date) * 1000) / 1000;
  return { priority, distance, ticketAvailability, friendInterest, date, total };
}

/** Whole days from `from` (default now) to an ISO event date. */
export function daysUntil(isoDate: string, from: Date = new Date()): number {
  const target = Date.parse(`${isoDate}T00:00:00Z`);
  const base = Date.parse(`${from.toISOString().slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(target) || Number.isNaN(base)) return 0;
  return Math.round((target - base) / 86_400_000);
}
