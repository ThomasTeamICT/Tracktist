"use client";

import { useCallback, useEffect, useState } from "react";
import {
  UserPlus,
  Check,
  X,
  Trash2,
  Loader2,
  Clock,
  Users,
  ShieldCheck,
  MailPlus,
} from "lucide-react";
import { Badge, Button, Card, Input, SectionTitle } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Types (loose shapes matching the documented JSON API)              */
/* ------------------------------------------------------------------ */

interface FriendUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface AcceptedFriendship {
  id: string;
  friend: FriendUser;
}

interface IncomingFriendship {
  id: string;
  from: FriendUser;
}

interface OutgoingFriendship {
  id: string;
  to: FriendUser;
}

interface FriendsData {
  accepted: AcceptedFriendship[];
  incoming: IncomingFriendship[];
  outgoing: OutgoingFriendship[];
}

const EMPTY: FriendsData = { accepted: [], incoming: [], outgoing: [] };

/* ------------------------------------------------------------------ */

export function FriendsClient() {
  const [data, setData] = useState<FriendsData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/friends", { credentials: "same-origin" });
      if (!res.ok) throw new Error("Laden mislukt");
      const json: Partial<FriendsData> = await res.json();
      setData({
        accepted: json.accepted ?? [],
        incoming: json.incoming ?? [],
        outgoing: json.outgoing ?? [],
      });
      setError(null);
    } catch {
      setError("Kon je vrienden niet laden. Probeer het later opnieuw.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <InviteForm onInvited={load} />

      <PrivacyNote />

      {loading ? (
        <div className="flex items-center gap-2 text-white/55">
          <Loader2 className="h-4 w-4 animate-spin" /> Laden…
        </div>
      ) : error ? (
        <Card className="text-white/70">{error}</Card>
      ) : (
        <>
          {data.incoming.length > 0 ? (
            <section>
              <SectionTitle hint={`${data.incoming.length} wacht op je`}>Inkomende verzoeken</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.incoming.map((r) => (
                  <IncomingCard key={r.id} request={r} onChanged={load} />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <SectionTitle hint={data.accepted.length > 0 ? `${data.accepted.length} vriend(en)` : undefined}>
              Vrienden
            </SectionTitle>
            {data.accepted.length === 0 ? (
              <EmptyFriends />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.accepted.map((r) => (
                  <FriendCard key={r.id} friendship={r} onChanged={load} />
                ))}
              </div>
            )}
          </section>

          {data.outgoing.length > 0 ? (
            <section>
              <SectionTitle hint={`${data.outgoing.length} in afwachting`}>Verzonden</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.outgoing.map((r) => (
                  <OutgoingCard key={r.id} request={r} onChanged={load} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Invite form                                                        */
/* ------------------------------------------------------------------ */

function InviteForm({ onInvited }: { onInvited: () => void | Promise<void> }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const messages: Record<string, string> = {
    "no Tracktist user with that email": "Geen Tracktist-gebruiker met dat e-mailadres.",
    "cannot invite yourself": "Je kunt jezelf niet uitnodigen.",
    "valid email required": "Vul een geldig e-mailadres in.",
  };

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (value.length === 0 || busy) return;
    setBusy(true);
    setSuccess(null);
    setError(null);
    try {
      const res = await fetch("/api/friends/invite", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const json: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(messages[json.error ?? ""] ?? "Uitnodigen mislukt. Probeer het opnieuw.");
        return;
      }
      setSuccess(`Als ${value} een Tracktist-account heeft, is het verzoek verstuurd.`);
      setEmail("");
      await onInvited();
    } catch {
      setError("Uitnodigen mislukt. Probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h3 className="flex items-center gap-2 font-medium text-white">
          <MailPlus className="h-4 w-4 text-accent-soft" /> Vriend uitnodigen
        </h3>
        <p className="text-sm text-white/55">
          Voer het e-mailadres in van iemand die al een Tracktist-account heeft.
        </p>
      </div>
      <form onSubmit={(e) => void invite(e)} className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="vriend@voorbeeld.be"
          aria-label="E-mailadres van vriend"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setSuccess(null);
            setError(null);
          }}
          className="sm:flex-1"
        />
        <Button type="submit" disabled={busy || email.trim().length === 0} className="shrink-0">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Uitnodigen
        </Button>
      </form>
      {success ? <p className="text-sm text-emerald-300">{success}</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Privacy note                                                       */
/* ------------------------------------------------------------------ */

function PrivacyNote() {
  return (
    <Card className="flex items-start gap-3 bg-white/5">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-soft" />
      <p className="text-sm text-white/55">
        Je deelt alleen welke artiesten en optredens je interesseren. Je exacte locatie wordt
        standaard nooit met vrienden gedeeld.
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Avatar                                                             */
/* ------------------------------------------------------------------ */

function initials(user: FriendUser): string {
  const base = (user.name ?? user.email ?? "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ user }: { user: FriendUser }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white/5 text-sm font-medium text-accent-soft">
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(user)
      )}
    </span>
  );
}

function PersonRow({ user }: { user: FriendUser }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar user={user} />
      <div className="min-w-0">
        <p className="truncate font-semibold text-white">{user.name ?? user.email ?? "Onbekend"}</p>
        {user.name && user.email ? (
          <p className="truncate text-sm text-white/50">{user.email}</p>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cards                                                              */
/* ------------------------------------------------------------------ */

function FriendCard({
  friendship,
  onChanged,
}: {
  friendship: AcceptedFriendship;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = friendship.friend.name ?? friendship.friend.email ?? "deze vriend";

  async function remove() {
    if (!window.confirm(`${name} verwijderen als vriend?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/friends/${friendship.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error();
      await onChanged();
    } catch {
      setError("Verwijderen mislukt.");
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <PersonRow user={friendship.friend} />
        <Badge tone="success">vriend</Badge>
      </div>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      <Button
        size="sm"
        variant="danger"
        className="self-start"
        disabled={busy}
        onClick={() => void remove()}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        Verwijder
      </Button>
    </Card>
  );
}

function IncomingCard({
  request,
  onChanged,
}: {
  request: IncomingFriendship;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy("accept");
    setError(null);
    try {
      const res = await fetch("/api/friends/accept", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendshipId: request.id }),
      });
      if (!res.ok) throw new Error();
      await onChanged();
    } catch {
      setError("Accepteren mislukt.");
      setBusy(null);
    }
  }

  async function decline() {
    setBusy("decline");
    setError(null);
    try {
      const res = await fetch(`/api/friends/${request.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error();
      await onChanged();
    } catch {
      setError("Weigeren mislukt.");
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <PersonRow user={request.from} />
        <Badge tone="accent">verzoek</Badge>
      </div>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          disabled={busy !== null}
          onClick={() => void accept()}
        >
          {busy === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Accepteer
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={busy !== null}
          onClick={() => void decline()}
        >
          {busy === "decline" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          Weiger
        </Button>
      </div>
    </Card>
  );
}

function OutgoingCard({
  request,
  onChanged,
}: {
  request: OutgoingFriendship;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/friends/${request.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error();
      await onChanged();
    } catch {
      setError("Intrekken mislukt.");
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <PersonRow user={request.to} />
        <Badge tone="warning">
          <Clock className="h-3 w-3" /> in afwachting
        </Badge>
      </div>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        disabled={busy}
        onClick={() => void cancel()}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        Verzoek intrekken
      </Button>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function EmptyFriends() {
  return (
    <Card className="text-center">
      <span className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-white/5 text-accent-soft">
        <Users className="h-5 w-5" />
      </span>
      <p className="font-medium text-white">Nog geen vrienden</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-white/55">
        Nodig iemand uit met het formulier hierboven. Zodra ze je verzoek accepteren, zien jullie
        van elkaar naar welke optredens je wil gaan — samen plannen wordt zo een stuk leuker.
      </p>
    </Card>
  );
}
