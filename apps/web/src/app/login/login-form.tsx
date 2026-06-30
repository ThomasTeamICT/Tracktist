"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Mail } from "lucide-react";
import { Button, Input } from "@/components/ui";

export function LoginForm({
  providers,
}: {
  providers: { google: boolean; email: boolean };
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const anyProvider = providers.google || providers.email;

  return (
    <div className="space-y-4">
      {providers.google ? (
        <Button variant="outline" className="w-full" onClick={() => signIn("google", { callbackUrl: "/dashboard" })}>
          Doorgaan met Google
        </Button>
      ) : null}

      {providers.email ? (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            await signIn("nodemailer", { email, callbackUrl: "/onboarding", redirect: false });
            setSent(true);
            setLoading(false);
          }}
        >
          <Input
            type="email"
            required
            placeholder="jij@voorbeeld.be"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={loading}>
            <Mail className="h-4 w-4" /> Stuur magic link
          </Button>
          {sent ? (
            <p className="text-center text-sm text-emerald-300">
              Check je mailbox voor de inloglink.
            </p>
          ) : null}
        </form>
      ) : null}

      {!anyProvider ? (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
          Geen auth-provider geconfigureerd. Zet <code>GOOGLE_CLIENT_ID</code>/<code>GOOGLE_CLIENT_SECRET</code>{" "}
          of <code>EMAIL_SERVER</code>/<code>EMAIL_FROM</code> in <code>.env</code> om in te loggen.
        </p>
      ) : null}
    </div>
  );
}
