import Link from "next/link";
import { redirect } from "next/navigation";
import { Globe2, MapPin, Bell, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { Button } from "@/components/ui";
import { LandingGlobe } from "@/components/landing-globe";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const features = [
    { icon: Globe2, title: "3D-wereldbol", body: "Zie waar je artiesten spelen op een interactieve globe." },
    { icon: MapPin, title: "Grensoverschrijdend", body: "Relevantie is afstand, geen landsgrens. Dendermonde hoort bij Amsterdam, Rijsel én Keulen." },
    { icon: Bell, title: "Slimme meldingen", body: "Eén goede, tijdige melding — geen overvolle agenda." },
    { icon: Users, title: "Samen leuker", body: "Vrienden, gedeelde lijsten, samen naar een show." },
  ];

  return (
    <main className="mx-auto max-w-5xl px-6">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent shadow-glow">
            <Globe2 className="h-5 w-5" />
          </span>
          Tracktist
        </div>
        <Link href="/login">
          <Button variant="outline" size="sm">Inloggen</Button>
        </Link>
      </header>

      <section className="relative grid items-center gap-8 py-12 lg:grid-cols-2 lg:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/4 top-0 -z-10 h-72 w-72 -translate-x-1/2 animate-float rounded-full opacity-70 blur-2xl"
          style={{ backgroundImage: "radial-gradient(circle at 40% 35%, #9d86ff, #5b3df0 45%, transparent 70%)" }}
        />
        <div className="animate-fade-up text-center lg:text-left">
          <p className="mb-4 inline-block rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
            Your personal live-music radar
          </p>
          <h1 className="mx-auto max-w-3xl font-display text-4xl font-bold leading-tight sm:text-6xl lg:mx-0">
            Track your favourite artists.{" "}
            <span className="bg-gradient-to-r from-accent to-glow bg-clip-text text-transparent">
              See the world. Catch the show.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-white/60 lg:mx-0">
            Voeg je artiesten toe en hoef daarna niets meer op te zoeken. Tracktist
            detecteert nieuwe concertdata, ontdubbelt ze, berekent de afstand tot jou
            en stuurt alleen relevante meldingen — landsgrenzen overschrijdend.
          </p>
          <div className="mt-8 flex justify-center gap-3 lg:justify-start">
            <Link href="/login">
              <Button size="lg">Begin gratis</Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">Bekijk je eigen globe</Button>
            </Link>
          </div>
        </div>
        <LandingGlobe />
      </section>

      <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className="card p-5 transition-all duration-200 hover:-translate-y-1 hover:border-white/20 hover:shadow-glow">
              <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-accent-grad-soft text-accent-soft ring-1 ring-inset ring-white/10">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-white/55">{f.body}</p>
            </div>
          );
        })}
      </section>
    </main>
  );
}
