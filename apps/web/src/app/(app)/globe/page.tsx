import { requireUser } from "@/lib/session";
import { getUserAgenda, getUserAnchors } from "@/lib/queries";
import { toGlobeEvent } from "@/lib/serialize";
import { GlobeView } from "@/components/globe-view";
import { SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function GlobePage() {
  const user = await requireUser();
  const [agenda, anchors] = await Promise.all([getUserAgenda(user.id), getUserAnchors(user.id)]);

  const events = agenda.map((a) => toGlobeEvent(a.evaluated, a.db.id));
  const pins = anchors
    .filter((a) => a.active)
    .map((a) => ({ label: a.label, lat: a.location.lat, lng: a.location.lng, radiusKm: a.radiusKm }));

  return (
    <div className="space-y-4">
      <SectionTitle hint={`${events.length} optreden(s)`}>Globe</SectionTitle>
      {events.length === 0 ? (
        <p className="text-white/55">
          Nog geen optredens om te tonen. Volg artiesten en stel een thuisanker in.
        </p>
      ) : (
        <GlobeView events={events} anchors={pins} />
      )}
    </div>
  );
}
