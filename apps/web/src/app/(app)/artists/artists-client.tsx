"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Plus,
  RefreshCw,
  Trash2,
  Loader2,
  Music2,
  Upload,
  Check,
  AlertTriangle,
  CalendarCheck,
} from "lucide-react";
import { Badge, Button, Card, Input, SectionTitle } from "@/components/ui";
import { displayImageUrl } from "@/lib/images";

/* ------------------------------------------------------------------ */
/* Types (loose shapes matching the documented JSON API)              */
/* ------------------------------------------------------------------ */

type Priority = "low" | "normal" | "high" | "must_see";

interface FollowedArtist {
  id: string;
  name: string;
  mbid: string | null;
  imageUrl: string | null;
  disambiguation: string | null;
  country: string | null;
  genres: string[];
  priority: Priority;
  notifyMode: string;
  countryCodes: string[];
  upcomingEvents: number;
  lastSyncedAt: string | null;
}

interface SearchCandidate {
  mbid?: string;
  name: string;
  sortName?: string;
  disambiguation?: string;
  country?: string;
  genres?: string[];
  score: number;
  externalIds?: Record<string, string>;
}

interface ImportCandidate {
  mbid?: string;
  name: string;
  disambiguation?: string;
}

interface ImportOutcome {
  followed: { name: string; artistId: string }[];
  ambiguous: { query: string; candidates: ImportCandidate[] }[];
  notFound: string[];
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "low", label: "Laag" },
  { value: "normal", label: "Normaal" },
  { value: "high", label: "Hoog" },
  { value: "must_see", label: "Niet missen" },
];

/* ------------------------------------------------------------------ */

export function ArtistsClient() {
  const [artists, setArtists] = useState<FollowedArtist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadArtists = useCallback(async () => {
    try {
      const res = await fetch("/api/artists/following", { credentials: "same-origin" });
      if (!res.ok) throw new Error("Laden mislukt");
      const data: { artists?: FollowedArtist[] } = await res.json();
      setArtists(data.artists ?? []);
      setError(null);
    } catch {
      setError("Kon je artiesten niet laden. Probeer het later opnieuw.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadArtists();
  }, [loadArtists]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Mijn artiesten</h1>
        <p className="text-white/55">Beheer wie je volgt — wij houden de concertdata in de gaten.</p>
      </header>

      <ArtistSearch onFollowed={loadArtists} />

      <section>
        <SectionTitle hint={artists.length > 0 ? `${artists.length} gevolgd` : undefined}>
          Gevolgde artiesten
        </SectionTitle>
        {loading ? (
          <div className="flex items-center gap-2 text-white/55">
            <Loader2 className="h-4 w-4 animate-spin" /> Laden…
          </div>
        ) : error ? (
          <Card className="text-white/70">{error}</Card>
        ) : artists.length === 0 ? (
          <EmptyFollowing />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {artists.map((a) => (
              <ArtistCard key={a.id} artist={a} onChanged={loadArtists} />
            ))}
          </div>
        )}
      </section>

      <ImportPanel onImported={loadArtists} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live search + follow                                               */
/* ------------------------------------------------------------------ */

function ArtistSearch({ onFollowed }: { onFollowed: () => void | Promise<void> }) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [followingKey, setFollowingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setCandidates([]);
      setSearched(false);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/artists/search?q=${encodeURIComponent(q)}`, {
          credentials: "same-origin",
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error();
        const data: { candidates?: SearchCandidate[] } = await res.json();
        setCandidates(data.candidates ?? []);
        setSearched(true);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setCandidates([]);
          setSearched(true);
        }
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [query]);

  async function follow(candidate: SearchCandidate, key: string) {
    setFollowingKey(key);
    setMessage(null);
    try {
      const res = await fetch("/api/artists/follow", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: candidate.name,
          mbid: candidate.mbid,
          sortName: candidate.sortName,
          disambiguation: candidate.disambiguation,
          country: candidate.country,
          genres: candidate.genres,
        }),
      });
      if (!res.ok) throw new Error();
      const data: { result?: { name: string; alreadyFollowing: boolean } } = await res.json();
      setMessage(
        data.result?.alreadyFollowing
          ? `Je volgt ${candidate.name} al.`
          : `${candidate.name} toegevoegd.`,
      );
      setQuery("");
      setCandidates([]);
      setSearched(false);
      await onFollowed();
    } catch {
      setMessage(`Kon ${candidate.name} niet volgen. Probeer het opnieuw.`);
    } finally {
      setFollowingKey(null);
    }
  }

  return (
    <section>
      <SectionTitle hint="zoek op naam">Artiest zoeken</SectionTitle>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        <Input
          className="pl-9"
          type="search"
          placeholder="Bijv. Fontaines D.C., Charlotte de Witte…"
          aria-label="Zoek een artiest"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setMessage(null);
          }}
        />
        {searching ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/40" />
        ) : null}
      </div>

      {message ? <p className="mt-2 text-sm text-accent-soft">{message}</p> : null}

      {candidates.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {candidates.map((c, i) => {
            const key = c.mbid ?? `${c.name}-${i}`;
            return (
              <li key={key}>
                <Card className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-white">{c.name}</span>
                      {c.country ? <Badge>{c.country}</Badge> : null}
                    </div>
                    {c.disambiguation ? (
                      <p className="truncate text-sm text-white/55">{c.disambiguation}</p>
                    ) : null}
                    {c.genres && c.genres.length > 0 ? (
                      <p className="mt-1 truncate text-xs text-white/40">{c.genres.slice(0, 3).join(" · ")}</p>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0"
                    disabled={followingKey === key}
                    onClick={() => void follow(c, key)}
                  >
                    {followingKey === key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Volg
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : searched && !searching ? (
        <p className="mt-3 text-sm text-white/55">Geen artiesten gevonden voor “{query.trim()}”.</p>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* One followed-artist card                                           */
/* ------------------------------------------------------------------ */

function ArtistCard({
  artist,
  onChanged,
}: {
  artist: FollowedArtist;
  onChanged: () => void | Promise<void>;
}) {
  const [priority, setPriority] = useState<Priority>(artist.priority);
  const [savingPriority, setSavingPriority] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [unfollowing, setUnfollowing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function changePriority(next: Priority) {
    const previous = priority;
    setPriority(next);
    setSavingPriority(true);
    setNote(null);
    try {
      const res = await fetch(`/api/user-artists/${artist.id}/preferences`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setPriority(previous);
      setNote("Prioriteit opslaan mislukt.");
    } finally {
      setSavingPriority(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setNote(null);
    try {
      const res = await fetch(`/api/artists/${artist.id}/sync`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error();
      const data: { eventCount?: number; skipped?: boolean } = await res.json();
      setNote(
        data.skipped
          ? "Net al gesynchroniseerd — probeer het over een paar minuten opnieuw."
          : `Gesynchroniseerd — ${data.eventCount ?? 0} optreden(s).`,
      );
      await onChanged();
    } catch {
      setNote("Synchroniseren mislukt.");
    } finally {
      setSyncing(false);
    }
  }

  async function unfollow() {
    if (!window.confirm(`${artist.name} niet langer volgen?`)) return;
    setUnfollowing(true);
    setNote(null);
    try {
      const res = await fetch(`/api/artists/${artist.id}/follow`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error();
      await onChanged();
    } catch {
      setNote("Ontvolgen mislukt.");
      setUnfollowing(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/5 text-accent-soft">
          {artist.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayImageUrl(artist.imageUrl) ?? undefined}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <Music2 className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0">
          <Link
            href={`/artists/${artist.id}`}
            className="block truncate font-semibold text-white transition hover:text-accent-soft"
          >
            {artist.name}
          </Link>
          {artist.disambiguation ? (
            <p className="truncate text-sm text-white/55">{artist.disambiguation}</p>
          ) : null}
        </div>
      </div>

      {artist.genres.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {artist.genres.slice(0, 4).map((g) => (
            <Badge key={g}>{g}</Badge>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-1.5 text-sm text-white/60">
        <CalendarCheck className="h-4 w-4 text-accent-soft" />
        {artist.upcomingEvents} komende optreden(s)
      </div>

      <label className="block text-xs text-white/50">
        Prioriteit
        <select
          className="input mt-1 w-full"
          value={priority}
          disabled={savingPriority}
          onChange={(e) => void changePriority(e.target.value as Priority)}
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      {note ? <p className="text-xs text-white/55">{note}</p> : null}

      <div className="mt-auto flex gap-2">
        <Button
          size="sm"
          variant="subtle"
          className="flex-1"
          disabled={syncing}
          onClick={() => void sync()}
        >
          <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Sync nu
        </Button>
        <Button
          size="sm"
          variant="danger"
          aria-label={`${artist.name} ontvolgen`}
          disabled={unfollowing}
          onClick={() => void unfollow()}
        >
          {unfollowing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Import panel (CSV + Last.fm)                                       */
/* ------------------------------------------------------------------ */

function ImportPanel({ onImported }: { onImported: () => void | Promise<void> }) {
  const [csv, setCsv] = useState("");
  const [lastfm, setLastfm] = useState("");
  const [busy, setBusy] = useState<"csv" | "lastfm" | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);

  async function runImport(kind: "csv" | "lastfm") {
    setBusy(kind);
    setError(null);
    setOutcome(null);
    try {
      const url = kind === "csv" ? "/api/import/csv" : "/api/import/lastfm";
      const body =
        kind === "csv" ? { text: csv } : { username: lastfm.trim() };
      const res = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const data: { outcome?: ImportOutcome } = await res.json();
      setOutcome(
        data.outcome ?? { followed: [], ambiguous: [], notFound: [] },
      );
      await onImported();
      outcomeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch {
      setError("Importeren mislukt. Controleer je invoer en probeer het opnieuw.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <SectionTitle hint="vanuit een lijst of Last.fm">Importeren</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <div>
            <h3 className="font-medium text-white">CSV / lijst plakken</h3>
            <p className="text-sm text-white/55">Eén artiestnaam per regel (of komma-gescheiden).</p>
          </div>
          <textarea
            className="input min-h-[120px] resize-y"
            placeholder={"Fontaines D.C.\nCharlotte de Witte\nKhruangbin"}
            aria-label="Artiesten om te importeren"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          <Button
            className="self-start"
            disabled={busy !== null || csv.trim().length === 0}
            onClick={() => void runImport("csv")}
          >
            {busy === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Importeer lijst
          </Button>
        </Card>

        <Card className="flex flex-col gap-3">
          <div>
            <h3 className="font-medium text-white">Last.fm</h3>
            <p className="text-sm text-white/55">Importeer je meest beluisterde artiesten.</p>
          </div>
          <Input
            placeholder="Last.fm-gebruikersnaam"
            aria-label="Last.fm-gebruikersnaam"
            value={lastfm}
            onChange={(e) => setLastfm(e.target.value)}
          />
          <Button
            className="self-start"
            disabled={busy !== null || lastfm.trim().length === 0}
            onClick={() => void runImport("lastfm")}
          >
            {busy === "lastfm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Importeer van Last.fm
          </Button>
        </Card>
      </div>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      {outcome ? (
        <div ref={outcomeRef} className="mt-4">
          <ImportResult outcome={outcome} />
        </div>
      ) : null}
    </section>
  );
}

function ImportResult({ outcome }: { outcome: ImportOutcome }) {
  const { followed, ambiguous, notFound } = outcome;
  const total = followed.length + ambiguous.length + notFound.length;

  if (total === 0) {
    return <Card className="text-sm text-white/60">Geen artiesten om te importeren gevonden.</Card>;
  }

  return (
    <Card className="space-y-4">
      {followed.length > 0 ? (
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300">
            <Check className="h-4 w-4" /> Gevolgd ({followed.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {followed.map((f) => (
              <Badge key={f.artistId} tone="success">
                {f.name}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {ambiguous.length > 0 ? (
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-300">
            <AlertTriangle className="h-4 w-4" /> Niet eenduidig ({ambiguous.length})
          </p>
          <p className="mb-2 text-xs text-white/45">
            Meerdere artiesten matchen. Zoek ze hierboven op om de juiste te volgen.
          </p>
          <ul className="space-y-1.5">
            {ambiguous.map((a) => (
              <li key={a.query} className="text-sm text-white/70">
                <span className="text-white">{a.query}</span>
                {a.candidates.length > 0 ? (
                  <span className="text-white/45">
                    {" — "}
                    {a.candidates
                      .slice(0, 3)
                      .map((c) => (c.disambiguation ? `${c.name} (${c.disambiguation})` : c.name))
                      .join(", ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {notFound.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-medium text-white/70">Niet gevonden ({notFound.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {notFound.map((n) => (
              <Badge key={n}>{n}</Badge>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function EmptyFollowing() {
  return (
    <Card className="text-center">
      <p className="font-medium text-white">Je volgt nog geen artiesten</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-white/55">
        Zoek hierboven een artiest of importeer je lijst. Daarna verschijnen hun optredens vanzelf op je
        dashboard en globe.
      </p>
    </Card>
  );
}
