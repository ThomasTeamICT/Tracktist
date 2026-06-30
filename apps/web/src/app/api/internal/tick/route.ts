import { json, serverError } from "@/lib/api";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runSyncTick } from "@/lib/jobs";

/**
 * POST /api/internal/tick — driven by the worker on a schedule (brief §5.2).
 * Guarded by INTERNAL_API_SECRET so only the worker can trigger it.
 */
export async function POST(req: Request) {
  if (!env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "internal API disabled (no secret set)" }, { status: 503 });
  }
  if (req.headers.get("x-internal-secret") !== env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { limit?: number; staleHours?: number };
    const result = await runSyncTick(body);
    return json({ ok: true, ...result });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : "tick failed");
  }
}
