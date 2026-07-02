import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarPlus,
  Clock,
  MapPin,
  Music2,
  Navigation,
  Ticket,
  Users,
} from "lucide-react";
import { distancesForEvent } from "@tracktist/core";
import { prisma } from "@/lib/prisma";
import { getUserAnchors } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import {
  dbEventToCanonical,
  headlinerImageUrl,
  utcToIsoDate,
  type DbEventWithRelations,
} from "@/lib/mappers";
import { Badge, Button, SectionTitle, gradientFromName } from "@/components/ui";
import { cssBgUrl, formatDate, formatDistance } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TICKET_TONE: Record<string, "accent" | "neutral" | "danger" | "warning"> = {
  available: "accent",
  presale: "warning",
  sold_out: "neutral",
  cancelled: "danger",
  unknown: "neutral",
};

const TICKET_LABEL: Record<string, string> = {
  available: "tickets beschikbaar",
  presale: "presale",
  sold_out: "uitverkocht",
  cancelled: "geannuleerd",
  unknown: "ticketstatus onbekend",
};

const STATUS_TONE: Record<string, "accent" | "neutral" | "danger" | "warning" | "success"> = {
  announced: "neutral",
  tickets_available: "success",
  sold_out: "neutral",
  cancelled: "danger",
  rescheduled: "warning",
  past: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  announced: "aangekondigd",
  tickets_available: "tickets beschikbaar",
  sold_out: "uitverkocht",
  cancelled: "geannuleerd",
  rescheduled: "verplaatst",
  past: "geweest",
};

function formatCheckedAt(iso: string, locale = "nl-BE"): string {
  const d = new Date(iso);
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [dbEvent, anchors] = await Promise.all([
    prisma.event.findUnique({
      where: { id },
      include: {
        venue: true,
        artists: { include: { artist: { select: { id: true, name: true, mbid: true, imageUrl: true } } } },
        sources: true,
      },
    }),
    getUserAnchors(user.id),
  ]);
  if (!dbEvent) notFound();

  const canonical = dbEventToCanonical(dbEvent as unknown as DbEventWithRelations);
  const heroImageUrl = headlinerImageUrl(dbEvent as unknown as DbEventWithRelations);
  const distances = distancesForEvent(canonical, anchors);

  // The DB `date` column is a `@db.Date`; normalise it to an ISO `YYYY-MM-DD`.
  const eventDate = utcToIsoDate(dbEvent.date);

  const venue = canonical.venue;
  const location = venue.location;
  const ticketSource = canonical.sources.find((s) => Boolean(s.ticketUrl));
  const hasTicketLink = Boolean(ticketSource);
  const lowConfidence = canonical.confidenceScore < 0.5;
  const supportActs = canonical.supportActs;

  const addressParts = [venue.address, venue.city, venue.country].filter(Boolean);
  const fullAddress = addressParts.join(", ");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-white/55 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Terug naar dashboard
      </Link>

      <header className="relative animate-fade-up overflow-hidden rounded-3xl border border-white/10 shadow-card">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={
            heroImageUrl
              ? { backgroundImage: cssBgUrl(heroImageUrl) }
              : { backgroundImage: gradientFromName(canonical.artistName) }
          }
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-bg/10" />
        <div className="relative flex min-h-[14rem] flex-col justify-end gap-3 p-6 sm:min-h-[17rem]">
          <div className="flex flex-wrap items-center gap-2">
            {canonical.isFestival ? <Badge tone="accent">festival</Badge> : null}
            <Badge tone={STATUS_TONE[canonical.status] ?? "neutral"}>
              {STATUS_LABEL[canonical.status] ?? canonical.status.replace(/_/g, " ")}
            </Badge>
            {TICKET_LABEL[canonical.ticketStatus] !== STATUS_LABEL[canonical.status] ? (
              <Badge tone={TICKET_TONE[canonical.ticketStatus] ?? "neutral"}>
                {TICKET_LABEL[canonical.ticketStatus] ?? canonical.ticketStatus.replace(/_/g, " ")}
              </Badge>
            ) : null}
          </div>

          <h1 className="font-display text-4xl font-bold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-5xl">
            {canonical.artistName}
          </h1>

          {canonical.festivalName ? (
            <p className="text-white/70">{canonical.festivalName}</p>
          ) : null}

          {supportActs.length > 0 ? (
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-white/65">
              <Music2 className="h-4 w-4 text-accent-soft" />
              <span className="text-white/50">met</span>
              {supportActs.join(", ")}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/75">
            <span className="inline-flex items-center gap-1.5">
              <CalendarPlus className="h-4 w-4 text-accent-soft" />
              {formatDate(eventDate)}
            </span>
            {canonical.startTime ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-accent-soft" />
                {canonical.startTime}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-3">
        {hasTicketLink ? (
          <a
            href={`/api/events/${dbEvent.id}/ticket-link`}
            target="_blank"
            rel="noreferrer"
          >
            <Button>
              <Ticket className="h-4 w-4" /> Tickets
            </Button>
          </a>
        ) : null}
        <a href={`/api/events/${dbEvent.id}/calendar`}>
          <Button variant="outline">
            <CalendarPlus className="h-4 w-4" /> In agenda
          </Button>
        </a>
      </div>

      {lowConfidence ? (
        <div className="card border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-300">
            Dit optreden is nog niet volledig bevestigd. We tonen het op basis van beperkte
            bronnen — controleer de details voor je tickets koopt.
          </p>
        </div>
      ) : null}

      <section className="card p-5">
        <SectionTitle>Locatie</SectionTitle>
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 font-medium text-white">
            <MapPin className="h-4 w-4 text-accent-soft" />
            {venue.name}
          </p>
          {fullAddress ? (
            <p className="pl-6 text-sm text-white/60">{fullAddress}</p>
          ) : (
            <p className="pl-6 text-sm text-white/45">Adres onbekend</p>
          )}
          {location ? (
            <p className="pl-6 text-xs text-white/40">
              Coördinaten: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
            </p>
          ) : (
            <p className="pl-6 text-xs text-white/40">Coördinaten onbekend</p>
          )}
        </div>
      </section>

      <section className="card p-5">
        <SectionTitle hint={`${distances.length} anker(s)`}>Afstand</SectionTitle>
        {distances.length === 0 ? (
          <p className="text-sm text-white/55">
            {location
              ? "Geen actieve ankers voor deze datum. Stel een thuislocatie in om de afstand te zien."
              : "Geen coördinaten bekend, dus we kunnen de afstand niet berekenen."}
          </p>
        ) : (
          <ul className="space-y-2">
            {distances.map((d) => (
              <li
                key={d.anchorId ?? d.anchorLabel}
                className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm text-white/80">
                  <Navigation className="h-4 w-4 text-accent-soft" />
                  {d.anchorLabel}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-sm text-white/60">{formatDistance(d.distanceKm)}</span>
                  {d.withinRadius ? <Badge tone="success">binnen straal</Badge> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <SectionTitle hint={`betrouwbaarheid ${Math.round(canonical.confidenceScore * 100)}%`}>
          Bronnen
        </SectionTitle>
        {canonical.sources.length === 0 ? (
          <p className="text-sm text-white/55">Geen bronnen geregistreerd voor dit optreden.</p>
        ) : (
          <ul className="space-y-2">
            {canonical.sources.map((s) => {
              const inner = (
                <span className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
                  <Badge tone="neutral">{s.provider}</Badge>
                  <span className="text-xs text-white/40">
                    laatst gecontroleerd op {formatCheckedAt(s.lastCheckedAt)}
                  </span>
                </span>
              );
              return (
                <li key={`${s.provider}-${s.sourceId}`}>
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block transition hover:opacity-80"
                    >
                      {inner}
                    </a>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="flex items-center gap-1.5 text-xs text-white/35">
        <Users className="h-3.5 w-3.5" />
        Volg deze artiest om updates over dit optreden te ontvangen.
      </p>
    </div>
  );
}
