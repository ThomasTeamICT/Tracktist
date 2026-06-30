/**
 * Confidence score 0.0–1.0 (brief §5.4).
 *
 * Factors: number of confirming sources, official ticket link present, venue
 * confirmed, date/location complete, exact artist-ID match (not a vague text
 * match), recently checked, and no conflict between sources. Low-confidence
 * events are shown with a "not fully confirmed" label and never silently
 * overwrite higher-confidence data.
 */

export interface ConfidenceInput {
  /** How many distinct providers confirmed the event. */
  sourceCount: number;
  /** At least one source carries an official ticket link. */
  hasOfficialTicketLink: boolean;
  /** Venue has a name and coordinates. */
  venueConfirmed: boolean;
  /** A concrete calendar date is present. */
  dateComplete: boolean;
  /** City + country + coordinates all present. */
  locationComplete: boolean;
  /** Artist matched via MBID / external id rather than a fuzzy name match. */
  exactArtistIdMatch: boolean;
  /** Hours since the event was last verified against a source. */
  hoursSinceChecked: number;
  /** Sources disagree on status/venue/date. */
  hasConflict: boolean;
}

const WEIGHTS = {
  multiSource: 0.25,
  officialTicketLink: 0.15,
  venueConfirmed: 0.15,
  locationComplete: 0.15,
  dateComplete: 0.1,
  exactArtistIdMatch: 0.2,
} as const;

const CONFLICT_PENALTY = 0.2;
const STALE_PENALTY = 0.1;
const STALE_AFTER_HOURS = 24 * 7; // a week

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function computeConfidence(input: ConfidenceInput): number {
  let score = 0;
  if (input.sourceCount >= 2) score += WEIGHTS.multiSource;
  if (input.hasOfficialTicketLink) score += WEIGHTS.officialTicketLink;
  if (input.venueConfirmed) score += WEIGHTS.venueConfirmed;
  if (input.locationComplete) score += WEIGHTS.locationComplete;
  if (input.dateComplete) score += WEIGHTS.dateComplete;
  if (input.exactArtistIdMatch) score += WEIGHTS.exactArtistIdMatch;

  if (input.hasConflict) score -= CONFLICT_PENALTY;
  if (input.hoursSinceChecked > STALE_AFTER_HOURS) score -= STALE_PENALTY;

  return Math.round(clamp01(score) * 100) / 100;
}

/** Threshold below which an event is flagged "not fully confirmed" (§5.4). */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

export function isLowConfidence(score: number): boolean {
  return score < LOW_CONFIDENCE_THRESHOLD;
}
