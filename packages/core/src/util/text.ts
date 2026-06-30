/**
 * Small, dependency-free text utilities for matching artist and venue names
 * across sources (brief §5.3 fuzzy match, §15 edge cases).
 */

/**
 * Lowercase, strip diacritics, drop punctuation, collapse whitespace. Used as
 * the base for comparing names that differ only cosmetically across sources
 * ("Café De La Danse" vs "cafe de la danse").
 */
export function normalizeName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diacritics
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Venue-specific normalization: also drops common venue noise words and
 * leading articles so "AFAS Live" ≈ "AFAS Live (Amsterdam)" ≈ "the afas live".
 */
const VENUE_STOPWORDS = new Set([
  "the",
  "le",
  "la",
  "les",
  "de",
  "het",
  "der",
  "die",
  "das",
  "hall",
  "arena",
  "theatre",
  "theater",
  "zaal",
  "club",
  "concert",
  "venue",
  "live",
]);

export function normalizeVenue(input: string): string {
  // Strip parentheticals on the raw string first — normalizeName turns the
  // parentheses themselves into spaces, so this must run before it.
  const withoutParens = input.replace(/\(.*?\)/g, " ");
  const base = normalizeName(withoutParens);
  const tokens = base
    .split(" ")
    .filter((t) => t.length > 0 && !VENUE_STOPWORDS.has(t));
  // Keep the significant tokens; if everything was a stopword, fall back to base.
  return (tokens.length > 0 ? tokens.join(" ") : base).trim();
}

/** Levenshtein edit distance (iterative, O(n·m) time, O(min) space). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure b is the shorter for the rolling row.
  if (a.length < b.length) [a, b] = [b, a];

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ac = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ac === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1, // deletion
        curr[j - 1]! + 1, // insertion
        prev[j - 1]! + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/**
 * Normalized similarity in [0,1] from edit distance: 1 = identical,
 * 0 = nothing in common. Operates on already-normalized strings.
 */
export function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Token-set overlap (Jaccard) on normalized names — robust to word reordering
 * and extra qualifiers, which edit distance handles poorly.
 */
export function tokenOverlap(a: string, b: string): number {
  const sa = new Set(normalizeName(a).split(" ").filter(Boolean));
  const sb = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Combined fuzzy venue similarity: max of edit-distance similarity and token
 * overlap, both on venue-normalized strings. Tolerant to noise words and
 * reordering while still catching close typos.
 */
export function venueSimilarity(a: string, b: string): number {
  const na = normalizeVenue(a);
  const nb = normalizeVenue(b);
  return Math.max(similarity(na, nb), tokenOverlap(a, b));
}
