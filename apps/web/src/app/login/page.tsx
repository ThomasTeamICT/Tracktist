import Link from "next/link";
import { redirect } from "next/navigation";
import { Globe2, MapPin, Bell, Users } from "lucide-react";
import { enabledAuthProviders } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

const POINTS = [
  { icon: MapPin, text: "Grensoverschrijdend — afstand telt, geen landsgrens" },
  { icon: Bell, text: "Eén goede, tijdige melding i.p.v. een overvolle agenda" },
  { icon: Globe2, text: "Zie al je shows op een draaiende 3D-wereldbol" },
  { icon: Users, text: "Samen plannen met vrienden en crews" },
];

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 app-bg" />
        <div
          className="absolute -top-24 left-1/3 h-[34rem] w-[34rem] animate-float rounded-full opacity-40 blur-3xl"
          style={{ backgroundImage: "radial-gradient(circle at 40% 35%, #9d86ff, #5b3df0 45%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-[-8rem] right-[-6rem] h-[28rem] w-[28rem] rounded-full opacity-30 blur-3xl"
          style={{ backgroundImage: "radial-gradient(circle at 50% 50%, #19e6c8, transparent 70%)" }}
        />
      </div>

      <div className="mx-auto grid min-h-screen max-w-5xl items-center gap-12 px-6 py-10 lg:grid-cols-2">
        {/* Left — brand & pitch */}
        <div className="animate-fade-up space-y-6">
          <Link href="/" className="flex items-center gap-2.5 font-semibold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-grad shadow-glow">
              <Globe2 className="h-5 w-5" />
            </span>
            <span className="text-lg">Tracktist</span>
          </Link>
          <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
            Nooit meer een <span className="gradient-text">show missen</span> in de buurt.
          </h1>
          <p className="max-w-md text-white/60">
            Voeg je favoriete artiesten toe en hoef daarna niets meer op te zoeken. Tracktist
            detecteert nieuwe concertdata, berekent de afstand tot jou en waarschuwt je — over de
            grens heen.
          </p>
          <ul className="space-y-2.5">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-white/70">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-grad-soft text-accent-soft ring-1 ring-inset ring-white/10">
                  <Icon className="h-4 w-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* Right — login card */}
        <div className="animate-fade-up">
          <div className="card p-6 sm:p-7">
            <h2 className="font-display text-xl font-semibold">Inloggen of registreren</h2>
            <p className="mb-5 mt-1 text-sm text-white/55">
              Volg je artiesten en mis nooit meer een show in de buurt.
            </p>
            <LoginForm
              providers={{ google: enabledAuthProviders.google, email: enabledAuthProviders.email }}
            />
          </div>
          <p className="mt-4 px-2 text-center text-xs text-white/40">
            Locatie wordt zo grof mogelijk opgeslagen (anker + straal) — geen continue tracking.
          </p>
        </div>
      </div>
    </main>
  );
}
