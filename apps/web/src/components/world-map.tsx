"use client";
import { useMemo, useState } from "react";
import { X, Ticket, CalendarPlus, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import type { GlobeEventDTO } from "@/lib/serialize";
import { Badge, Button } from "@/components/ui";
import { cn, formatDate, formatDistance } from "@/lib/utils";

/**
 * Functional orthographic globe (brief §6.3 — "functional, not decorative").
 * Pure SVG: sphere + graticule, the anchor's radius ring projected onto the
 * sphere, glowing arcs to within-radius shows, pulsing markers, a time slider
 * and rotate controls — no map tiles, works offline and on weak devices. A
 * full WebGL Globe.gl/R3F globe is the v1.5 upgrade on the same data contract.
 */

interface AnchorPin {
  label: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

const R = 250;
const CX = 320;
const CY = 300;
const toRad = (d: number) => (d * Math.PI) / 180;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

interface Projected {
  x: number;
  y: number;
  visible: boolean;
}

function makeProjector(centerLat: number, centerLng: number) {
  const phi0 = toRad(centerLat);
  const lam0 = toRad(centerLng);
  return (lat: number, lng: number): Projected => {
    const phi = toRad(lat);
    const lam = toRad(lng);
    const cosc =
      Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(lam - lam0);
    const x = R * Math.cos(phi) * Math.sin(lam - lam0);
    const y = -R * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(lam - lam0));
    return { x: CX + x, y: CY + y, visible: cosc >= 0 };
  };
}

function visiblePath(points: Projected[]): string {
  let d = "";
  let pen = false;
  for (const p of points) {
    if (p.visible) {
      d += pen ? ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : ` M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      pen = true;
    } else pen = false;
  }
  return d.trim();
}

function destPoint(lat: number, lng: number, bearingDeg: number, distKm: number) {
  const d = distKm / 6371;
  const t = toRad(bearingDeg);
  const p1 = toRad(lat);
  const l1 = toRad(lng);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: (p2 * 180) / Math.PI, lng: (l2 * 180) / Math.PI };
}

export function WorldMap({ events, anchors }: { events: GlobeEventDTO[]; anchors: AnchorPin[] }) {
  const home = anchors[0];
  const [centerLng, setCenterLng] = useState(home ? home.lng : 8);
  const centerLat = clamp(home ? home.lat : 35, 12, 55);
  const [selected, setSelected] = useState<GlobeEventDTO | null>(null);
  const [monthIdx, setMonthIdx] = useState(12);

  const months = useMemo(() => buildMonthBuckets(events), [events]);
  const filtered = useMemo(() => {
    if (monthIdx >= months.length) return events;
    const bucket = months[monthIdx];
    return events.filter((e) => e.date.slice(0, 7) === bucket?.key);
  }, [events, months, monthIdx]);

  const scene = useMemo(() => {
    const project = makeProjector(centerLat, centerLng);

    const meridians: string[] = [];
    for (let lng = -180; lng < 180; lng += 30) {
      const pts: Projected[] = [];
      for (let lat = -85; lat <= 85; lat += 6) pts.push(project(lat, lng));
      meridians.push(visiblePath(pts));
    }
    const parallels: string[] = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: Projected[] = [];
      for (let lng = -180; lng <= 180; lng += 6) pts.push(project(lat, lng));
      parallels.push(visiblePath(pts));
    }

    let radiusPath = "";
    let anchorP: Projected | null = null;
    if (home) {
      anchorP = project(home.lat, home.lng);
      const ring: Projected[] = [];
      for (let b = 0; b <= 360; b += 6) {
        const d = destPoint(home.lat, home.lng, b, home.radiusKm);
        ring.push(project(d.lat, d.lng));
      }
      radiusPath = visiblePath(ring);
    }

    const markers = filtered
      .filter((e) => e.lat !== null && e.lng !== null)
      .map((e) => ({ e, p: project(e.lat as number, e.lng as number) }))
      .filter((m) => m.p.visible);

    const arcs =
      anchorP && anchorP.visible
        ? markers
            .filter((m) => m.e.withinRadius)
            .map((m) => {
              const mx = (anchorP!.x + m.p.x) / 2;
              const my = (anchorP!.y + m.p.y) / 2;
              // lift the control point toward the globe centre for a domed arc
              const cx = mx + (CX - mx) * -0.18;
              const cy = my + (CY - my) * -0.18;
              return `M ${anchorP!.x.toFixed(1)} ${anchorP!.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${m.p.x.toFixed(1)} ${m.p.y.toFixed(1)}`;
            })
        : [];

    return { meridians, parallels, radiusPath, anchorP, markers, arcs };
  }, [filtered, centerLat, centerLng, home]);

  const plottedCount = scene.markers.length;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="card overflow-hidden p-0">
        <div className="relative">
          <svg viewBox="0 0 640 600" className="h-auto w-full">
            <defs>
              <radialGradient id="ocean" cx="42%" cy="35%" r="75%">
                <stop offset="0%" stopColor="#1b2348" />
                <stop offset="55%" stopColor="#0f1430" />
                <stop offset="100%" stopColor="#080a18" />
              </radialGradient>
              <radialGradient id="atmo" cx="50%" cy="50%" r="50%">
                <stop offset="78%" stopColor="rgba(124,92,255,0)" />
                <stop offset="93%" stopColor="rgba(124,92,255,0.28)" />
                <stop offset="100%" stopColor="rgba(124,92,255,0)" />
              </radialGradient>
              <filter id="soft"><feGaussianBlur stdDeviation="2.2" /></filter>
            </defs>

            {/* atmosphere halo */}
            <circle cx={CX} cy={CY} r={R + 16} fill="url(#atmo)" />
            {/* sphere */}
            <circle cx={CX} cy={CY} r={R} fill="url(#ocean)" stroke="rgba(124,92,255,0.25)" strokeWidth={1} />

            {/* graticule */}
            <g stroke="rgba(255,255,255,0.06)" fill="none" strokeWidth={0.8}>
              {scene.parallels.map((d, i) => (d ? <path key={`p${i}`} d={d} /> : null))}
              {scene.meridians.map((d, i) => (d ? <path key={`m${i}`} d={d} /> : null))}
            </g>

            {/* anchor radius ring on the sphere */}
            {scene.radiusPath ? (
              <path d={scene.radiusPath} fill="rgba(124,92,255,0.07)" stroke="rgba(124,92,255,0.55)" strokeWidth={1.3} strokeDasharray="5 5" />
            ) : null}

            {/* arcs from home to within-radius shows */}
            <g fill="none" stroke="rgba(25,230,200,0.5)" strokeWidth={1.2} filter="url(#soft)">
              {scene.arcs.map((d, i) => (
                <path key={`a${i}`} d={d} />
              ))}
            </g>

            {/* event markers */}
            {scene.markers.map(({ e, p }) => {
              const active = selected?.eventId === e.eventId;
              return (
                <g key={e.eventId} className="cursor-pointer" onClick={() => setSelected(e)}>
                  {e.withinRadius ? (
                    <circle cx={p.x} cy={p.y} r={6} fill="rgba(25,230,200,0.35)" className="origin-center animate-pulse-ring" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
                  ) : null}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={active ? 7 : 4.5}
                    className={e.withinRadius ? "marker-glow" : ""}
                    fill={e.withinRadius ? "#19e6c8" : "#8088b0"}
                    stroke={active ? "#fff" : "rgba(0,0,0,0.45)"}
                    strokeWidth={active ? 2 : 1}
                  />
                </g>
              );
            })}

            {/* home anchor */}
            {scene.anchorP && scene.anchorP.visible ? (
              <g>
                <circle cx={scene.anchorP.x} cy={scene.anchorP.y} r={7} fill="rgba(124,92,255,0.35)" className="animate-pulse-ring" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
                <circle cx={scene.anchorP.x} cy={scene.anchorP.y} r={5} fill="#9d86ff" stroke="#fff" strokeWidth={1.5} />
              </g>
            ) : null}
          </svg>

          {/* rotate controls */}
          <div className="absolute right-3 top-3 flex gap-1.5">
            <button onClick={() => setCenterLng((v) => v - 30)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-bg/60 text-white/70 backdrop-blur hover:bg-white/10" aria-label="Draai naar west">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setCenterLng((v) => v + 30)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-bg/60 text-white/70 backdrop-blur hover:bg-white/10" aria-label="Draai naar oost">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {months.length > 0 ? (
          <div className="flex items-center gap-3 border-t border-white/5 px-4 py-3">
            <span className="text-xs text-white/50">Periode</span>
            <input type="range" min={0} max={months.length} value={monthIdx} onChange={(e) => setMonthIdx(Number(e.target.value))} className="flex-1 accent-accent" />
            <span className="w-24 text-right text-xs text-white/70">{monthIdx >= months.length ? "Alles" : months[monthIdx]?.label}</span>
          </div>
        ) : null}
      </div>

      <aside className="space-y-3">
        <div className="flex items-center gap-4 text-xs text-white/55">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-glow shadow-glow-teal" /> binnen straal</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#8088b0]" /> verder weg</span>
        </div>
        {selected ? (
          <MarkerDetail event={selected} onClose={() => setSelected(null)} />
        ) : (
          <div className="card p-4 text-sm text-white/60">
            <p className="font-medium text-white/80">{plottedCount} optreden(s) zichtbaar</p>
            <p className="mt-1 text-white/50">Klik op een marker voor details, of draai de globe met de pijltjes om shows aan de andere kant van de wereld te zien.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

export function MarkerDetail({ event, onClose }: { event: GlobeEventDTO; onClose: () => void }) {
  return (
    <div className="card animate-fade-up p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-white">{event.artistName}</h3>
          <p className="text-sm text-white/55">{formatDate(event.date)} · {event.venue}</p>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      <p className="mt-2 flex items-center gap-1 text-sm text-white/55">
        <MapPin className="h-3.5 w-3.5" /> {[event.city, event.country].filter(Boolean).join(", ")} · {formatDistance(event.distanceKm)}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone={event.withinRadius ? "success" : "neutral"}>{event.withinRadius ? "binnen straal" : "verder weg"}</Badge>
        <Badge tone={event.ticketStatus === "available" ? "success" : "neutral"}>{event.ticketStatus}</Badge>
        {event.lowConfidence ? <Badge tone="warning">nog niet bevestigd</Badge> : null}
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

export function buildMonthBuckets(events: GlobeEventDTO[]) {
  const keys = [...new Set(events.map((e) => e.date.slice(0, 7)))].sort();
  return keys.map((key) => ({
    key,
    label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString("nl-BE", { month: "short", year: "numeric", timeZone: "UTC" }),
  }));
}
