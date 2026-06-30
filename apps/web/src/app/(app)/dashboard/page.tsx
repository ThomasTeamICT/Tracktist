import Link from "next/link";
import { Music2, MapPin, CalendarCheck, Plus } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getUserAgenda } from "@/lib/queries";
import { toGlobeEvent } from "@/lib/serialize";
import { EventCard } from "@/components/event-card";
import { Button, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const [agenda, followCount, anchorCount] = await Promise.all([
    getUserAgenda(user.id),
    prisma.userArtistFollow.count({ where: { userId: user.id } }),
    prisma.userLocation.count({ where: { userId: user.id } }),
  ]);

  const dtos = agenda.map((a) => toGlobeEvent(a.evaluated, a.db.id));
  const byRelevance = [...dtos].sort((a, b) => b.relevance - a.relevance);
  const within = dtos.filter((e) => e.withinRadius);

  if (followCount === 0) {
    return <EmptyState hasAnchor={anchorCount > 0} />;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Hallo<span className="gradient-text">{user.name ? `, ${user.name.split(" ")[0]}` : ""}</span>
          </h1>
          <p className="mt-1 text-white/55">Je persoonlijke live-muziekradar.</p>
        </div>
        <Link href="/artists">
          <Button><Plus className="h-4 w-4" /> Artiest toevoegen</Button>
        </Link>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat icon={<Music2 className="h-4 w-4" />} label="Gevolgd" value={followCount} />
        <Stat icon={<CalendarCheck className="h-4 w-4" />} label="Komende shows" value={dtos.length} />
        <Stat icon={<MapPin className="h-4 w-4" />} label="Binnen straal" value={within.length} />
      </div>

      {within.length > 0 ? (
        <section>
          <SectionTitle hint="binnen je straal">Binnenkort dichtbij</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {within.slice(0, 6).map((e) => (
              <EventCard key={e.eventId} event={e} />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle hint="gerangschikt op relevantie">Voor jou</SectionTitle>
        {byRelevance.length === 0 ? (
          <p className="text-white/55">
            Nog geen concertdata gevonden. We synchroniseren je artiesten op de achtergrond —
            kijk straks nog eens.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {byRelevance.slice(0, 12).map((e) => (
              <EventCard key={e.eventId} event={e} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-grad text-white shadow-glow">{icon}</span>
      <div>
        <div className="font-display text-2xl font-semibold leading-none">{value}</div>
        <div className="mt-1 text-xs text-white/50">{label}</div>
      </div>
    </div>
  );
}

function EmptyState({ hasAnchor }: { hasAnchor: boolean }) {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <h1 className="text-xl font-semibold">Welkom bij Tracktist 🎶</h1>
      <p className="mx-auto mt-2 max-w-md text-white/60">
        {hasAnchor
          ? "Voeg je eerste artiesten toe — daarna hoef je niets meer op te zoeken."
          : "Stel eerst je thuislocatie + straal in en voeg dan je artiesten toe."}
      </p>
      <div className="mt-5 flex justify-center gap-3">
        <Link href="/onboarding"><Button>Aan de slag</Button></Link>
        <Link href="/artists"><Button variant="outline">Artiesten zoeken</Button></Link>
      </div>
    </div>
  );
}
