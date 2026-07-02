"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Globe2, Map as MapIcon } from "lucide-react";
import type { GlobeEventDTO } from "@/lib/serialize";
import type { AnchorPin } from "@/components/globe-3d";
import { MarkerDetail, WorldMap, buildMonthBuckets } from "@/components/world-map";
import { cn } from "@/lib/utils";

// WebGL globe is client-only (three.js); never render it on the server.
const Globe3D = dynamic(() => import("@/components/globe-3d").then((m) => m.Globe3D), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-[420px] w-full place-items-center text-sm text-white/40">
      Globe laden…
    </div>
  ),
});

export function GlobeView({ events, anchors }: { events: GlobeEventDTO[]; anchors: AnchorPin[] }) {
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [selected, setSelected] = useState<GlobeEventDTO | null>(null);
  // null = "Alles" — a fixed numeric default would silently pick one month
  // when the agenda spans more months than the default index.
  const [monthIdx, setMonthIdx] = useState<number | null>(null);

  const months = useMemo(() => buildMonthBuckets(events), [events]);
  const filtered = useMemo(() => {
    if (monthIdx === null || monthIdx >= months.length) return events;
    const bucket = months[monthIdx];
    return events.filter((e) => e.date.slice(0, 7) === bucket?.key);
  }, [events, months, monthIdx]);

  const plotted = filtered.filter((e) => e.lat !== null && e.lng !== null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs text-white/55">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-glow shadow-glow-teal" /> binnen straal
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#8b93bd]" /> verder weg
          </span>
        </div>
        <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-0.5">
          <ModeButton active={mode === "3d"} onClick={() => setMode("3d")}>
            <Globe2 className="h-4 w-4" /> 3D
          </ModeButton>
          <ModeButton active={mode === "2d"} onClick={() => setMode("2d")}>
            <MapIcon className="h-4 w-4" /> 2D
          </ModeButton>
        </div>
      </div>

      {mode === "2d" ? (
        <WorldMap events={filtered} anchors={anchors} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="card overflow-hidden p-0">
            <div className="bg-[radial-gradient(ellipse_at_top,#141833,#07070c)]">
              <Globe3D events={filtered} anchors={anchors} onSelect={setSelected} />
            </div>
            {months.length > 0 ? (
              <div className="flex items-center gap-3 border-t border-white/5 px-4 py-3">
                <span className="text-xs text-white/50">Periode</span>
                <input
                  type="range"
                  min={0}
                  max={months.length}
                  value={monthIdx ?? months.length}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setMonthIdx(v >= months.length ? null : v);
                  }}
                  className="flex-1 accent-accent"
                  aria-label="Filter optredens op maand"
                />
                <span className="w-24 text-right text-xs text-white/70">
                  {monthIdx === null ? "Alles" : months[monthIdx]?.label}
                </span>
              </div>
            ) : null}
          </div>

          <aside className="space-y-3">
            {selected ? (
              <MarkerDetail event={selected} onClose={() => setSelected(null)} />
            ) : (
              <div className="card p-4 text-sm text-white/60">
                <p className="font-medium text-white/80">{plotted.length} optreden(s) op de globe</p>
                <p className="mt-1 text-white/50">
                  Sleep om te draaien, scroll om te zoomen, en klik op een gloeiende marker voor details.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
        active ? "bg-accent text-white shadow-glow" : "text-white/60 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
