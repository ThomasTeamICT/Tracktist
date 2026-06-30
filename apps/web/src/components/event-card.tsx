import Link from "next/link";
import { Ticket, CalendarPlus, MapPin, Users } from "lucide-react";
import type { GlobeEventDTO } from "@/lib/serialize";
import { Badge, Button } from "@/components/ui";
import { formatDate, formatDistance } from "@/lib/utils";

const TICKET_TONE: Record<string, "accent" | "neutral" | "danger" | "warning"> = {
  available: "accent",
  presale: "warning",
  sold_out: "neutral",
  cancelled: "danger",
  unknown: "neutral",
};

export function EventCard({ event, friendCount = 0 }: { event: GlobeEventDTO; friendCount?: number }) {
  return (
    <div className="card flex flex-col gap-3 p-4 transition hover:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/events/${event.eventId}`} className="font-semibold text-white hover:text-accent-soft">
            {event.artistName}
          </Link>
          <p className="mt-0.5 truncate text-sm text-white/60">
            {formatDate(event.date)} · {event.venue}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-white/45">
            <MapPin className="h-3.5 w-3.5" />
            {[event.city, event.country].filter(Boolean).join(", ") || "Locatie onbekend"}
            {" · "}
            {formatDistance(event.distanceKm)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {event.withinRadius ? <Badge tone="success">binnen straal</Badge> : null}
          {event.isFestival ? <Badge tone="accent">festival</Badge> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={TICKET_TONE[event.ticketStatus] ?? "neutral"}>{event.ticketStatus.replace("_", " ")}</Badge>
        {event.lowConfidence ? <Badge tone="warning">nog niet volledig bevestigd</Badge> : null}
        {friendCount > 0 ? (
          <Badge tone="neutral">
            <Users className="h-3 w-3" /> {friendCount}
          </Badge>
        ) : null}
        {event.sources.map((s) => (
          <Badge key={s} title={`bron: ${s}`}>{s}</Badge>
        ))}
      </div>

      <div className="mt-auto flex gap-2">
        {event.hasTicketLink ? (
          <a href={`/api/events/${event.eventId}/ticket-link`} target="_blank" rel="noreferrer" className="flex-1">
            <Button size="sm" className="w-full"><Ticket className="h-4 w-4" /> Tickets</Button>
          </a>
        ) : null}
        <a href={`/api/events/${event.eventId}/calendar`} className="flex-1">
          <Button size="sm" variant="outline" className="w-full"><CalendarPlus className="h-4 w-4" /> Agenda</Button>
        </a>
      </div>
    </div>
  );
}
