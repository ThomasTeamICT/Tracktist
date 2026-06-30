import Link from "next/link";
import { redirect } from "next/navigation";
import { Globe2 } from "lucide-react";
import { enabledAuthProviders } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="mb-8 flex items-center gap-2 font-semibold">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent shadow-glow">
          <Globe2 className="h-5 w-5" />
        </span>
        Tracktist
      </Link>
      <div className="card p-6">
        <h1 className="text-xl font-semibold">Inloggen of registreren</h1>
        <p className="mb-5 mt-1 text-sm text-white/55">
          Volg je artiesten en mis nooit meer een show in de buurt.
        </p>
        <LoginForm providers={{ google: enabledAuthProviders.google, email: enabledAuthProviders.email }} />
      </div>
      <p className="mt-4 px-2 text-center text-xs text-white/40">
        Door in te loggen ga je akkoord met onze voorwaarden. Locatie wordt zo grof
        mogelijk opgeslagen (anker + straal) — geen continue tracking.
      </p>
    </main>
  );
}
