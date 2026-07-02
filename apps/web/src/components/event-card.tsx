import Link from "next/link";
import { Ticket, CalendarPlus, MapPin, Users, Calendar } from "lucide-react";
import type { GlobeEventDTO } from "@/lib/serialize";
import { Badge, ButtonLink, gradientFromName } from "@/components/ui";
import { cn, cssBgUrl, formatDate, formatDistance } from "@/lib/utils";

export const TICKET_TONE: Record<string, "accent" | "neutral" | "danger" | "warning" | "success"> = {
  available: "success",
  presale: "warning",
  sold_out: "neutral",
  cancelled: "danger",
  unknown: "neutral",
};
export const TICKET_LABEL: Record<string, string> = {
  available: "tickets",
  presale: "presale",
  sold_out: "uitverkocht",
  cancelled: "geannuleerd",
  unknown: "ticketstatus ?",
};

export function EventCard({ event, friendCount }: { event: GlobeEventDTO; friendCount?: number }) {
  const friends = friendCount ?? event.friendCount ?? 0;
  return (
    <div className="card group flex animate-fade-up flex-col overflow-hidden p-0 transition-all duration-200 hover:-translate-y-1 hover:border-white/20 hover:shadow-glow">
      {/* Cover — real artist photo, or the artist's identity gradient. */}
      <Link href={`/events/${event.eventId}`} className="relative block h-36 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
          style={
            event.artistImageUrl
              ? { backgroundImage: cssBgUrl(event.artistImageUrl) }
              : { backgroundImage: gradientFromName(event.artistName) }
          }
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg-card via-bg-card/50 to-transparent" />
        <div className="absolute right-3 top-3 flex gap-1.5">
          {event.withinRadius ? <Badge tone="success">binnen straal</Badge> : null}
          {event.isFestival ? <Badge tone="accent">festival</Badge> : null}
        </div>
        <div className="absolute inset-x-0 bottom-0 p-3">
          <h3 className="line-clamp-1 font-display text-lg font-semibold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
            {event.artistName}
          </h3>
          <p className="flex items-center gap-1.5 text-sm text-white/80">
            <Calendar className="h-3.5 w-3.5" /> {formatDate(event.date)}
          </p>
        </div>
      </Link>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="flex items-center gap-1.5 text-sm text-white/55">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-accent-soft/80" />
          <span className="min-w-0 flex-1 truncate">
            {[event.venue, event.city].filter(Boolean).join(" · ")}
          </span>
          <span
            className={cn(
              "shrink-0 whitespace-nowrap tabular-nums",
              event.withinRadius ? "text-glow" : "text-white/40",
            )}
          >
            {formatDistance(event.distanceKm)}
          </span>
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={TICKET_TONE[event.ticketStatus] ?? "neutral"}>
            {TICKET_LABEL[event.ticketStatus] ?? event.ticketStatus}
          </Badge>
          {event.lowConfidence ? <Badge tone="warning">nog niet bevestigd</Badge> : null}
          {friends > 0 ? (
            <Badge tone="neutral" title={`${friends} vriend(en) geïnteresseerd`}>
              <Users className="h-3 w-3" /> {friends}
            </Badge>
          ) : null}
          {event.sources.map((s) => (
            <Badge key={s} title={`bron: ${s}`}>{s}</Badge>
          ))}
        </div>

        <div className="mt-auto flex gap-2 pt-1">
          {event.hasTicketLink ? (
            <ButtonLink
              href={`/api/events/${event.eventId}/ticket-link`}
              target="_blank"
              rel="noreferrer"
              size="sm"
              className="flex-1"
            >
              <Ticket className="h-4 w-4" /> Tickets
            </ButtonLink>
          ) : null}
          <ButtonLink
            href={`/api/events/${event.eventId}/calendar`}
            size="sm"
            variant="outline"
            className={event.hasTicketLink ? "" : "flex-1"}
          >
            <CalendarPlus className="h-4 w-4" /> Agenda
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
