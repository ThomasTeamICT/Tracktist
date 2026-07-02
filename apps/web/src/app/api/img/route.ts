import { NextResponse } from "next/server";

/**
 * Minimal same-origin image proxy for third-party artist photos (Deezer CDN).
 * Serving them via our origin keeps user IPs/referers away from the third
 * party (GDPR, brief §14). Strictly allowlisted + long-lived cache, so this
 * can't be abused as an open proxy and stays cheap.
 */
const ALLOWED_HOSTS = new Set([
  "e-cdns-images.dzcdn.net",
  "cdn-images.dzcdn.net",
  "e-cdn-images.dzcdn.net",
]);

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
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 400 });
  }

  const upstream = await fetch(target, { headers: { accept: "image/*" } }).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "upstream failed" }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
}
