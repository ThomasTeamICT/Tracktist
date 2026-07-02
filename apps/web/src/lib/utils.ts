import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Human-friendly date label, e.g. "12 nov 2026". */
export function formatDate(iso: string, locale = "nl-BE"): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatDistance(km: number | null | undefined): string {
  if (km === null || km === undefined) return "—";
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/**
 * A CSS `background-image` value for an externally sourced image URL.
 * Characters that could break out of `url("...")` are percent-encoded so a
 * crafted URL can't inject CSS.
 */
export function cssBgUrl(url: string): string {
  return `url("${url.replace(/["'()\\\s]/g, (c) => encodeURIComponent(c))}")`;
}
