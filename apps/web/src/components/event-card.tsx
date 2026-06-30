import Link from "next/link";
import { Ticket, CalendarPlus, MapPin, Users, Calendar } from "lucide-react";
import type { GlobeEventDTO } from "@/lib/serialize";
import { Badge, Button, GradientAvatar } from "@/components/ui";
import { cn, formatDate, formatDistance } from "@/lib/utils";

const TICKET_TONE: Record<string, "accent" | "neutral" | "danger" | "warning" | "success"> = {
  available: "success",
  presale: "warning",
  sold_out: "neutral",
  cancelled: "danger",
  unknown: "neutral",
};
const TICKET_LABEL: Record<string, string> = {
  available: "tickets",
  presale: "presale",
  sold_out: "uitverkocht",
  cancelled: "geannuleerd",
  unknown: "ticketstatus ?",
};

export function EventCard({ event, friendCount = 0 }: { event: GlobeEventDTO; friendCount?: number }) {
  return (
    <div className="card group flex flex-col gap-3 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:shadow-glow">
      <div className="flex items-start gap-3">
        <GradientAvatar name={event.artistName} size={46} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/events/${event.eventId}`}
            className="line-clamp-1 font-semibold text-white transition group-hover:text-accent-soft"
          >
            {event.artistName}
          </Link>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/55">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-accent-soft/80" />
            <span className="truncate">{formatDate(event.date)} · {event.venue}</span>
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/40">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {[event.city, event.country].filter(Boolean).join(", ") || "Locatie onbekend"}
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
        </div>
        {event.withinRadius ? <Badge tone="success">binnen straal</Badge> : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={TICKET_TONE[event.ticketStatus] ?? "neutral"}>
          {TICKET_LABEL[event.ticketStatus] ?? event.ticketStatus}
        </Badge>
        {event.isFestival ? <Badge tone="accent">festival</Badge> : null}
        {event.lowConfidence ? <Badge tone="warning">nog niet bevestigd</Badge> : null}
        {friendCount > 0 ? (
          <Badge tone="neutral">
            <Users className="h-3 w-3" /> {friendCount}
          </Badge>
        ) : null}
        {event.sources.map((s) => (
          <Badge key={s} title={`bron: ${s}`}>{s}</Badge>
        ))}
      </div>

      <div className="mt-auto flex gap-2 pt-1">
        {event.hasTicketLink ? (
          <a href={`/api/events/${event.eventId}/ticket-link`} target="_blank" rel="noreferrer" className="flex-1">
            <Button size="sm" className="w-full"><Ticket className="h-4 w-4" /> Tickets</Button>
          </a>
        ) : null}
        <a href={`/api/events/${event.eventId}/calendar`} className={event.hasTicketLink ? "" : "flex-1"}>
          <Button size="sm" variant="outline" className="w-full">
            <CalendarPlus className="h-4 w-4" /> Agenda
          </Button>
        </a>
      </div>
    </div>
  );
}
