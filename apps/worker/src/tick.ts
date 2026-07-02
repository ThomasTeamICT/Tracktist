import { config } from "./config.js";

export interface TickResult {
  ok: boolean;
  artistsSynced?: number;
  syncedEvents?: number;
  notificationsTouched?: number;
  error?: string;
}

/** Call the web app's guarded internal tick endpoint. */
export async function runTick(body: {
  limit?: number;
  staleHours?: number;
  digest?: boolean;
}): Promise<TickResult> {
  const url = `${config.appBaseUrl}/api/internal/tick`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": config.internalSecret,
    },
    body: JSON.stringify(body),
    // A tick syncs up to `limit` artists against rate-limited providers; give
    // it room but never let a wedged request hang the scheduler forever.
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status} ${text}` };
  }
  return (await res.json()) as TickResult;
}
