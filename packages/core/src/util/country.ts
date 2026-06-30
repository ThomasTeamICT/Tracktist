/**
 * Lightweight country-name → ISO 3166-1 alpha-2 mapping. Providers usually
 * supply a code already; this fills the gap for sources that only give a name
 * (and supports the per-country notification filter in brief §6.2/§7).
 */
const NAME_TO_CODE: Record<string, string> = {
  belgium: "BE",
  belgie: "BE",
  belgique: "BE",
  netherlands: "NL",
  nederland: "NL",
  holland: "NL",
  france: "FR",
  germany: "DE",
  deutschland: "DE",
  luxembourg: "LU",
  "united kingdom": "GB",
  uk: "GB",
  "great britain": "GB",
  england: "GB",
  ireland: "IE",
  spain: "ES",
  espana: "ES",
  portugal: "PT",
  italy: "IT",
  italia: "IT",
  switzerland: "CH",
  austria: "AT",
  osterreich: "AT",
  denmark: "DK",
  sweden: "SE",
  norway: "NO",
  finland: "FI",
  poland: "PL",
  "czech republic": "CZ",
  czechia: "CZ",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  canada: "CA",
};

const ASCII = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Returns an alpha-2 code from a country name or passes through an existing code. */
export function toCountryCode(input?: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return NAME_TO_CODE[ASCII(trimmed)];
}
