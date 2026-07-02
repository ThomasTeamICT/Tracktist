import Link from "next/link";
import { Music2, MapPin, CalendarCheck, Plus, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getUserAgenda } from "@/lib/queries";
import { toGlobeEvent, type GlobeEventDTO } from "@/lib/serialize";
import { EventCard, TICKET_LABEL, TICKET_TONE } from "@/components/event-card";
import { Badge, Button, SectionTitle, gradientFromName } from "@/components/ui";
import { cssBgUrl, formatDate, formatDistance } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const [agenda, followCount, anchorCount] = await Promise.all([
    getUserAgenda(user.id),
    prisma.userArtistFollow.count({ where: { userId: user.id } }),
    prisma.userLocation.count({ where: { userId: user.id } }),
  ]);

  const dtos = agenda.map((a) => toGlobeEvent(a.evaluated, a.db.id, a.db, a.friendCount));
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

      {byRelevance[0] ? <FeaturedShow event={byRelevance[0]} /> : null}

      <div className="grid gap-3 min-[420px]:grid-cols-3">
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

function FeaturedShow({ event }: { event: GlobeEventDTO }) {
  return (
    <Link
      href={`/events/${event.eventId}`}
      className="group relative block h-60 animate-fade-up overflow-hidden rounded-3xl border border-white/10 shadow-card sm:h-72"
    >
      <div
        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
        style={
          event.artistImageUrl
            ? { backgroundImage: cssBgUrl(event.artistImageUrl) }
            : { backgroundImage: gradientFromName(event.artistName) }
        }
      />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg/80 via-bg/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 max-w-2xl p-6">
        <Badge tone="accent"><Sparkles className="h-3 w-3" /> Aanrader voor jou</Badge>
        <h2 className="mt-2 font-display text-3xl font-bold leading-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] sm:text-4xl">
          {event.artistName}
        </h2>
        <p className="mt-1 text-white/75">
          {formatDate(event.date)} · {[event.venue, event.city].filter(Boolean).join(", ")}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {event.withinRadius ? (
            <Badge tone="success">binnen straal · {formatDistance(event.distanceKm)}</Badge>
          ) : (
            <Badge>{formatDistance(event.distanceKm)}</Badge>
          )}
          <Badge tone={TICKET_TONE[event.ticketStatus] ?? "neutral"}>
            {TICKET_LABEL[event.ticketStatus] ?? event.ticketStatus}
          </Badge>
        </div>
      </div>
    </Link>
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
