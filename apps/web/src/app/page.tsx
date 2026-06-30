import Link from "next/link";
import { redirect } from "next/navigation";
import { Globe2, MapPin, Bell, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { Button } from "@/components/ui";

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

      <section className="py-16 text-center sm:py-24">
        <p className="mb-4 inline-block rounded-full bg-white/5 px-3 py-1 text-xs text-white/60">
          Your personal live-music radar
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
          Track your favourite artists.{" "}
          <span className="bg-gradient-to-r from-accent to-glow bg-clip-text text-transparent">
            See the world. Catch the show.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-white/60">
          Voeg je artiesten toe en hoef daarna niets meer op te zoeken. Tracktist
          detecteert nieuwe concertdata, ontdubbelt ze, berekent de afstand tot jou
          en stuurt alleen relevante meldingen — landsgrenzen overschrijdend.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/login">
            <Button size="lg">Begin gratis</Button>
          </Link>
          <Link href="/globe">
            <Button size="lg" variant="outline">Bekijk de globe</Button>
          </Link>
        </div>
      </section>

      <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className="card p-5">
              <Icon className="mb-3 h-6 w-6 text-accent-soft" />
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-white/55">{f.body}</p>
            </div>
          );
        })}
      </section>
    </main>
  );
}
