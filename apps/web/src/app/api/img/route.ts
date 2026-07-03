import { NextResponse } from "next/server";

/**
 * Minimal same-origin image proxy for third-party artist photos (Deezer CDN).
 * Serving them via our origin keeps user IPs/referers away from the third
 * party (GDPR, brief §14). Strictly allowlisted + long-lived cache, so this
 * can't be abused as an open proxy and stays cheap.
 */
// Must stay in sync with PROXIED_HOSTS in src/lib/images.ts — anything the
// helper routes here must be allowed, or the image is guaranteed broken.
const ALLOWED_HOST_SUFFIXES = [".dzcdn.net"];
const isAllowedHost = (hostname: string) =>
  ALLOWED_HOST_SUFFIXES.some((s) => hostname.endsWith(s));

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const src = new URL(req.url).searchParams.get("src");
  if (!src) return NextResponse.json({ error: "src required" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return NextResponse.json({ error: "invalid src" }, { status: 400 });
  }
  if (target.protocol !== "https:" || !isAllowedHost(target.hostname)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 400 });
  }

  // Follow redirects MANUALLY so every hop is re-validated against the
  // allowlist — automatic following would let an allowlisted host bounce the
  // proxy to an arbitrary origin.
  let upstream: Response | null = null;
  let hop = target;
  for (let i = 0; i < 3; i++) {
    const res = await fetch(hop, { headers: { accept: "image/*" }, redirect: "manual" }).catch(
      () => null,
    );
    if (!res) break;
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => undefined);
      if (!location) break;
      const next = new URL(location, hop);
      if (next.protocol !== "https:" || !isAllowedHost(next.hostname)) {
        return NextResponse.json({ error: "redirect not allowed" }, { status: 400 });
      }
      hop = next;
      continue;
    }
    upstream = res;
    break;
  }
  if (!upstream || !upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "upstream failed" }, { status: 502 });
  }
  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    await upstream.body.cancel().catch(() => undefined);
    return NextResponse.json({ error: "not an image" }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
}
