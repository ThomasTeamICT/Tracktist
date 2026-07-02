/**
 * Client-safe image URL helper. Third-party CDN photos (Deezer) are routed
 * through our same-origin proxy so the browser never talks to the CDN
 * directly (no IP/referer leak — brief §14). Anything else passes through.
 */
const PROXIED_HOSTS = [".dzcdn.net"];

export function displayImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && PROXIED_HOSTS.some((h) => u.hostname.endsWith(h))) {
      return `/api/img?src=${encodeURIComponent(url)}`;
    }
  } catch {
    /* not an absolute URL — pass through */
  }
  return url;
}
