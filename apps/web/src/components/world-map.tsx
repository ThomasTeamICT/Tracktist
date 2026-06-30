"use client";
import { useMemo, useState } from "react";
import { X, Ticket, CalendarPlus, MapPin } from "lucide-react";
import type { GlobeEventDTO } from "@/lib/serialize";
import { Badge, Button } from "@/components/ui";
import { cn, formatDate, formatDistance } from "@/lib/utils";

/**
 * Functional 2D map view (brief §6.3). Pure SVG equirectangular projection —
 * no map tiles, works offline, and degrades gracefully on weak devices. The
 * full React-Three-Fiber / Globe.gl 3D globe is the v1.5 upgrade on the same
 * data contract; markers, anchor + radius, time slider and the detail drawer
 * are all here already.
 */

interface AnchorPin {
  label: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

const W = 1000;
const H = 500;
const project = (lat: number, lng: number) => ({
  x: ((lng + 180) / 360) * W,
  y: ((90 - lat) / 180) * H,
});

export function WorldMap({
  events,
  anchors,
}: {
  events: GlobeEventDTO[];
  anchors: AnchorPin[];
}) {
  const [selected, setSelected] = useState<GlobeEventDTO | null>(null);
  const [monthIdx, setMonthIdx] = useState(12); // 0..12, 12 = all

  const months = useMemo(() => buildMonthBuckets(events), [events]);
  const filtered = useMemo(() => {
    if (monthIdx >= months.length) return events;
    const bucket = months[monthIdx];
    return events.filter((e) => e.date.slice(0, 7) === bucket?.key);
  }, [events, months, monthIdx]);

  const plotted = filtered.filter((e) => e.lat !== null && e.lng !== null);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="card overflow-hidden p-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full bg-[radial-gradient(ellipse_at_center,#10131f,#0a0a0f)]">
          <Graticule />
          {/* Anchor radius circles + pins */}
          {anchors.map((a, i) => {
            const p = project(a.lat, a.lng);
            // crude km→px at this projection scale (~111 km per degree latitude)
            const rPx = (a.radiusKm / 111) * (W / 360);
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={rPx} fill="rgba(124,92,255,0.10)" stroke="rgba(124,92,255,0.5)" strokeDasharray="4 4" />
                <circle cx={p.x} cy={p.y} r={4} fill="#7c5cff" />
                <text x={p.x + 7} y={p.y + 3} className="fill-white/70" fontSize={11}>{a.label}</text>
              </g>
            );
          })}
          {/* Event markers */}
          {plotted.map((e) => {
            const p = project(e.lat!, e.lng!);
            const active = selected?.eventId === e.eventId;
            return (
              <g key={e.eventId} className="cursor-pointer" onClick={() => setSelected(e)}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={active ? 8 : 5}
                  className={cn(e.withinRadius ? "marker-glow" : "")}
                  fill={e.withinRadius ? "#19e6c8" : "#8a8a9a"}
                  stroke={active ? "#fff" : "rgba(0,0,0,0.4)"}
                  strokeWidth={active ? 2 : 1}
                />
              </g>
            );
          })}
        </svg>
        {/* Time slider over the coming months */}
        {months.length > 0 ? (
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="text-xs text-white/50">Periode</span>
            <input
              type="range"
              min={0}
              max={months.length}
              value={monthIdx}
              onChange={(e) => setMonthIdx(Number(e.target.value))}
              className="flex-1 accent-accent"
            />
            <span className="w-24 text-right text-xs text-white/70">
              {monthIdx >= months.length ? "Alles" : months[monthIdx]?.label}
            </span>
          </div>
        ) : null}
      </div>

      <aside className="space-y-3">
        <div className="flex items-center gap-3 text-xs text-white/60">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-glow" /> binnen straal</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-white/40" /> verder weg</span>
        </div>
        {selected ? (
          <MarkerDetail event={selected} onClose={() => setSelected(null)} />
        ) : (
          <div className="card p-4 text-sm text-white/60">
            Klik op een marker voor details. {plotted.length} optreden(s) getoond.
          </div>
        )}
      </aside>
    </div>
  );
}

function MarkerDetail({ event, onClose }: { event: GlobeEventDTO; onClose: () => void }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold">{event.artistName}</h3>
          <p className="text-sm text-white/60">
            {formatDate(event.date)} · {event.venue}
          </p>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      <p className="mt-2 flex items-center gap-1 text-sm text-white/60">
        <MapPin className="h-3.5 w-3.5" /> {event.city}, {event.country} · {formatDistance(event.distanceKm)}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone={event.withinRadius ? "success" : "neutral"}>{event.withinRadius ? "binnen straal" : "verder weg"}</Badge>
        <Badge tone={event.ticketStatus === "available" ? "accent" : "neutral"}>{event.ticketStatus}</Badge>
        {event.lowConfidence ? <Badge tone="warning">nog niet volledig bevestigd</Badge> : null}
        {event.sources.map((s) => <Badge key={s}>{s}</Badge>)}
      </div>
      <div className="mt-4 flex gap-2">
        {event.hasTicketLink ? (
          <a href={`/api/events/${event.eventId}/ticket-link`} target="_blank" rel="noreferrer" className="flex-1">
            <Button className="w-full" size="sm"><Ticket className="h-4 w-4" /> Tickets</Button>
          </a>
        ) : null}
        <a href={`/api/events/${event.eventId}/calendar`} className="flex-1">
          <Button variant="outline" className="w-full" size="sm"><CalendarPlus className="h-4 w-4" /> Agenda</Button>
        </a>
      </div>
    </div>
  );
}

function Graticule() {
  const lines = [];
  for (let lng = -180; lng <= 180; lng += 30) {
    const x = ((lng + 180) / 360) * W;
    lines.push(<line key={`v${lng}`} x1={x} y1={0} x2={x} y2={H} stroke="rgba(255,255,255,0.05)" />);
  }
  for (let lat = -90; lat <= 90; lat += 30) {
    const y = ((90 - lat) / 180) * H;
    lines.push(<line key={`h${lat}`} x1={0} y1={y} x2={W} y2={y} stroke="rgba(255,255,255,0.05)" />);
  }
  // Highlight the European window where most MVP data lives.
  const tl = project(60, -12);
  const br = project(35, 30);
  lines.push(
    <rect key="eu" x={tl.x} y={tl.y} width={br.x - tl.x} height={br.y - tl.y} fill="none" stroke="rgba(124,92,255,0.15)" />,
  );
  return <g>{lines}</g>;
}

function buildMonthBuckets(events: GlobeEventDTO[]) {
  const keys = [...new Set(events.map((e) => e.date.slice(0, 7)))].sort();
  return keys.map((key) => ({
    key,
    label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString("nl-BE", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }),
  }));
}
