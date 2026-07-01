import { apiUser, json, unauthorized } from "@/lib/api";
import { getUserAgenda } from "@/lib/queries";
import { toGlobeEvent } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/globe/events?from=&to= — evaluated events for the globe/map
 * (brief §11). Response items match the documented globe-event shape.
 */
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  const agenda = await getUserAgenda(user.id);
  let events = agenda.map((a) => toGlobeEvent(a.evaluated, a.db.id, a.db));
  if (from) events = events.filter((e) => e.date >= from);
  if (to) events = events.filter((e) => e.date <= to);

  return json({ events });
}
