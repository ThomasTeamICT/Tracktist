import { timingSafeEqual } from "node:crypto";
import { json, serverError } from "@/lib/api";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runSyncTick } from "@/lib/jobs";

/** Constant-time secret comparison — `!==` would leak timing information. */
function secretsMatch(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * POST /api/internal/tick — driven by the worker on a schedule (brief §5.2).
 * Guarded by INTERNAL_API_SECRET so only the worker can trigger it.
 */
// A tick does real work (provider syncs + notification runs); allow it the
// full serverless budget instead of the platform default.
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "internal API disabled (no secret set)" }, { status: 503 });
  }
  if (!secretsMatch(req.headers.get("x-internal-secret"), env.INTERNAL_API_SECRET)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as {
      limit?: number;
      staleHours?: number;
      digest?: boolean;
    };
    const result = await runSyncTick(body);
    return json({ ok: true, ...result });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : "tick failed");
  }
}
