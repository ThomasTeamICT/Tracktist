import { apiUser, json, unauthorized } from "@/lib/api";
import { getUserAgenda } from "@/lib/queries";
import { toGlobeEvent } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** GET /api/events?within=1&country=NL — the user's evaluated agenda (brief §11). */
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const url = new URL(req.url);
  const within = url.searchParams.get("within") === "1";
  const country = url.searchParams.get("country")?.toUpperCase();

  const agenda = await getUserAgenda(user.id);
  let events = agenda.map((a) => toGlobeEvent(a.evaluated, a.db.id));
  if (within) events = events.filter((e) => e.withinRadius);
  if (country) events = events.filter((e) => e.countryCode === country);

  return json({ events });
}
