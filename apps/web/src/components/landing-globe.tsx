"use client";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { GlobeEventDTO } from "@/lib/serialize";
import type { AnchorPin } from "./globe-3d";

const Globe3D = dynamic(() => import("./globe-3d").then((m) => m.Globe3D), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-[420px] w-full place-items-center text-sm text-white/40">
      Wereldbol laden…
    </div>
  ),
});

/**
 * The landing-page hero globe: the real 3D Earth with showcase data — an
 * anchor in Dendermonde, glowing within-radius shows across the border and a
 * few far-away dots for scale. Clicking anything invites you in via /login.
 */

const HOME: AnchorPin = { label: "Thuis", lat: 51.03, lng: 4.1, radiusKm: 350 };

function demo(
  artistName: string,
  city: string,
  country: string,
  lat: number,
  lng: number,
  distanceKm: number,
  withinRadius: boolean,
  date: string,
): GlobeEventDTO {
  return {
    eventId: `${city}-${date}`,
    artistName,
    artistImageUrl: null,
    date,
    startTime: null,
    venue: city,
    city,
    country,
    countryCode: null,
    lat,
    lng,
    distanceKm,
    withinRadius,
    ticketStatus: "available",
    status: "announced",
    isFestival: false,
    confidenceScore: 1,
    lowConfidence: false,
    relevance: 1,
    hasTicketLink: false,
    sources: [],
    friendCount: 0,
  };
}

const SHOWCASE: GlobeEventDTO[] = [
  demo("The National", "Amsterdam", "Nederland", 52.37, 4.9, 155, true, "2026-09-18"),
  demo("Amenra", "Gent", "België", 51.05, 3.73, 26, true, "2026-10-10"),
  demo("The National", "Paris", "Frankrijk", 48.86, 2.35, 267, true, "2026-09-21"),
  demo("Amenra", "Keulen", "Duitsland", 50.94, 6.96, 205, true, "2026-10-17"),
  demo("The National", "London", "VK", 51.51, -0.13, 320, true, "2026-09-25"),
  demo("Amenra", "Tilburg", "Nederland", 51.56, 5.09, 90, true, "2026-10-12"),
  demo("The National", "Berlin", "Duitsland", 52.52, 13.4, 650, false, "2026-09-28"),
  demo("The National", "Barcelona", "Spanje", 41.39, 2.17, 1070, false, "2026-10-02"),
  demo("The National", "New York", "VS", 40.71, -74.01, 5890, false, "2026-11-05"),
  demo("Amenra", "Tokyo", "Japan", 35.68, 139.69, 9350, false, "2026-11-20"),
  demo("The National", "São Paulo", "Brazilië", -23.55, -46.63, 9500, false, "2026-12-01"),
];

export function LandingGlobe() {
  const router = useRouter();
  return (
    <div className="relative" aria-hidden>
      <Globe3D events={SHOWCASE} anchors={[HOME]} onSelect={() => router.push("/login")} />
    </div>
  );
}
