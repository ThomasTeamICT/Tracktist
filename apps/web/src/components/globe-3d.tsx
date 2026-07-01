"use client";
import { useEffect, useRef } from "react";
import type { GlobeEventDTO } from "@/lib/serialize";

/**
 * The flagship 3D globe (brief §6.3): a real, textured, spinnable Earth
 * (globe.gl / three.js) with glowing event markers, the user's anchor as
 * pulsing rings, and animated arcs to within-radius shows. Loaded imperatively
 * inside an effect (dynamic import) so WebGL never runs during SSR/build.
 */

export interface AnchorPin {
  label: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

// globe.gl's fluent instance is loosely typed here on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function Globe3D({
  events,
  anchors,
  onSelect,
}: {
  events: GlobeEventDTO[];
  anchors: AnchorPin[];
  onSelect: (e: GlobeEventDTO) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const dataRef = useRef({ events, anchors, onSelect });
  dataRef.current = { events, anchors, onSelect };

  useEffect(() => {
    let destroyed = false;
    let resizeObs: ResizeObserver | undefined;

    (async () => {
      const Globe = (await import("globe.gl")).default;
      const el = containerRef.current;
      if (destroyed || !el) return;

      const height = () => Math.max(420, Math.min(el.clientWidth, 620));
      const g = new Globe(el)
        .backgroundColor("rgba(0,0,0,0)")
        .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
        .bumpImageUrl("//unpkg.com/three-globe/example/img/earth-topology.png")
        .showAtmosphere(true)
        .atmosphereColor("#8b6dff")
        .atmosphereAltitude(0.2)
        .width(el.clientWidth)
        .height(height());
      globeRef.current = g;

      const controls = g.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.45;
      controls.enableZoom = true;
      controls.minDistance = 180;
      controls.maxDistance = 600;

      const home = dataRef.current.anchors[0];
      g.pointOfView({ lat: home?.lat ?? 30, lng: home?.lng ?? 6, altitude: 2.3 }, 0);

      resizeObs = new ResizeObserver(() => {
        if (globeRef.current) globeRef.current.width(el.clientWidth).height(height());
      });
      resizeObs.observe(el);

      applyData(g, dataRef.current);
    })();

    return () => {
      destroyed = true;
      resizeObs?.disconnect();
      const g = globeRef.current;
      if (g && typeof g._destructor === "function") g._destructor();
      if (containerRef.current) containerRef.current.innerHTML = "";
      globeRef.current = null;
    };
    // init once; data updates handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (globeRef.current) applyData(globeRef.current, { events, anchors, onSelect });
  }, [events, anchors, onSelect]);

  return <div ref={containerRef} className="min-h-[420px] w-full" aria-label="3D globe" />;
}

function applyData(
  g: any,
  { events, anchors, onSelect }: { events: GlobeEventDTO[]; anchors: AnchorPin[]; onSelect: (e: GlobeEventDTO) => void },
) {
  const points = events
    .filter((e) => e.lat !== null && e.lng !== null)
    .map((e) => ({ ...e, __color: e.withinRadius ? "#19e6c8" : "#8b93bd" }));

  g.pointsData(points)
    .pointLat((d: any) => d.lat)
    .pointLng((d: any) => d.lng)
    .pointColor((d: any) => d.__color)
    .pointAltitude((d: any) => (d.withinRadius ? 0.07 : 0.03))
    .pointRadius((d: any) => (d.withinRadius ? 0.38 : 0.26))
    .pointLabel(
      (d: any) =>
        `<div style="font:600 12px sans-serif;color:#fff">${escapeHtml(d.artistName)}</div>` +
        `<div style="font:12px sans-serif;color:#bbb">${[d.city, d.country].filter(Boolean).join(", ")} · ${d.date}</div>`,
    )
    .onPointClick((d: any) => onSelect(d));

  g.ringsData(anchors.map((a) => ({ lat: a.lat, lng: a.lng })))
    .ringLat((d: any) => d.lat)
    .ringLng((d: any) => d.lng)
    .ringColor(() => (t: number) => `rgba(124,92,255,${1 - t})`)
    .ringMaxRadius(3.5)
    .ringPropagationSpeed(2.2)
    .ringRepeatPeriod(1100);

  const home = anchors[0];
  const arcs = home
    ? points
        .filter((p) => p.withinRadius)
        .map((p) => ({ startLat: home.lat, startLng: home.lng, endLat: p.lat, endLng: p.lng }))
    : [];
  g.arcsData(arcs)
    .arcColor(() => ["rgba(25,230,200,0.05)", "rgba(25,230,200,0.85)"])
    .arcStroke(0.5)
    .arcDashLength(0.5)
    .arcDashGap(0.25)
    .arcDashAnimateTime(2200)
    .arcAltitudeAutoScale(0.35);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
