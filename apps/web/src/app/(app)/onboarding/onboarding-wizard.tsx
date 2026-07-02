"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  LocateFixed,
  Search,
  UserPlus,
  Check,
  Loader2,
  Bell,
  BellRing,
  ListPlus,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { Badge, Button, Input } from "@/components/ui";

/* ----------------------------- local types ----------------------------- */

interface GeoPlace {
  label: string;
  lat: number;
  lng: number;
  city?: string;
  countryCode?: string;
}

interface ArtistCandidate {
  mbid?: string;
  name: string;
  sortName?: string;
  disambiguation?: string;
  country?: string;
  genres?: string[];
  score: number;
}

interface FollowedArtist {
  name: string;
  artistId: string;
}

interface ImportOutcome {
  followed: { name: string; artistId: string }[];
  ambiguous: { query: string; candidates: ArtistCandidate[] }[];
  notFound: string[];
}

const RADIUS_PRESETS = [50, 150, 300, 500] as const;

/* ------------------------------ component ------------------------------- */

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  return (
    <div className="space-y-6">
      <ProgressBar step={step} />

      {step === 1 ? (
        <StepLocation onDone={() => setStep(2)} />
      ) : step === 2 ? (
        <StepArtists onBack={() => setStep(1)} onDone={() => setStep(3)} />
      ) : (
        <StepNotifications
          onBack={() => setStep(2)}
          onFinish={() => router.push("/dashboard")}
        />
      )}
    </div>
  );
}

/* ----------------------------- progress bar ----------------------------- */

const STEP_LABELS = ["Thuislocatie", "Artiesten", "Meldingen"] as const;

function ProgressBar({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Voortgang onboarding">
      {STEP_LABELS.map((label, i) => {
        const index = i + 1;
        const active = index === step;
        const done = index < step;
        return (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <span
              className={`h-1.5 rounded-full transition ${
                done || active ? "bg-accent" : "bg-white/10"
              }`}
              aria-hidden
            />
            <span
              className={`text-xs ${
                active ? "text-accent-soft" : done ? "text-white/60" : "text-white/35"
              }`}
            >
              {index}. {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* --------------------------- step 1: location --------------------------- */

function StepLocation({ onDone }: { onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<GeoPlace | null>(null);
  const [radius, setRadius] = useState(150);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) {
      setPlaces([]);
      setSearching(false);
      setSearchNote(null);
      return;
    }
    setSearching(true);
    setSearchNote(null);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error("geocode mislukt");
        const data: { places?: GeoPlace[] } = await res.json();
        setPlaces(data.places ?? []);
        // Never fail silently: an empty dropdown looks identical to "nothing
        // found" — say which of the two it is.
        setSearchNote(
          (data.places ?? []).length === 0 ? `Geen plaatsen gevonden voor "${q}".` : null,
        );
      } catch {
        setPlaces([]);
        setSearchNote("Zoeken is even niet beschikbaar. Probeer het opnieuw.");
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Locatie is niet beschikbaar in deze browser.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const place: GeoPlace = {
          label: "Mijn huidige locatie",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setSelected(place);
        setQuery(place.label);
        setPlaces([]);
        setLocating(false);
      },
      () => {
        setError("Kon je locatie niet ophalen. Geef toestemming of zoek handmatig.");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  function pick(place: GeoPlace) {
    setSelected(place);
    setQuery(place.label);
    setPlaces([]);
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/me/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          label: selected.label,
          latitude: selected.lat,
          longitude: selected.lng,
          city: selected.city,
          countryCode: selected.countryCode,
          radiusKm: radius,
          active: true,
        }),
      });
      if (!res.ok) throw new Error("opslaan mislukt");
      onDone();
    } catch {
      setError("Opslaan van je thuislocatie is mislukt. Probeer het opnieuw.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Waar woon je?</h2>
        <p className="mt-1 text-sm text-white/55">
          Zoek je thuisstad of gebruik je huidige locatie. Daarna bepaal je hoe ver je
          wil reizen voor een optreden.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-white/70" htmlFor="onb-place">
          Thuislocatie
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            id="onb-place"
            className="pl-9"
            placeholder="bv. Gent, Amsterdam, Berlijn…"
            value={query}
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
          />
          {searching ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/40" />
          ) : null}
        </div>

        {places.length > 0 && !selected ? (
          <ul className="overflow-hidden rounded-xl border border-white/10 bg-bg-soft">
            {places.map((p, i) => (
              <li key={`${p.label}-${i}`}>
                <button
                  type="button"
                  onClick={() => pick(p)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white/80 transition hover:bg-white/5"
                >
                  <MapPin className="h-4 w-4 shrink-0 text-accent-soft" />
                  <span className="truncate">{p.label}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {searchNote && !selected && !searching ? (
          <p className="text-sm text-white/55">{searchNote}</p>
        ) : null}

        <Button
          type="button"
          variant="subtle"
          size="sm"
          onClick={useMyLocation}
          disabled={locating}
        >
          {locating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LocateFixed className="h-4 w-4" />
          )}
          Gebruik mijn locatie
        </Button>
      </div>

      {selected ? (
        <div className="flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/10 px-3 py-2 text-sm text-accent-soft">
          <Check className="h-4 w-4" />
          <span className="truncate">{selected.label}</span>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm text-white/70" htmlFor="onb-radius">
            Reisbereik
          </label>
          <Badge tone="accent">{radius} km</Badge>
        </div>
        <input
          id="onb-radius"
          type="range"
          min={25}
          max={500}
          step={25}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="w-full accent-accent"
          aria-label="Reisbereik in kilometer"
        />
        <div className="flex flex-wrap gap-2">
          {RADIUS_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setRadius(preset)}
              className={`pill border transition ${
                radius === preset
                  ? "border-accent/40 bg-accent/20 text-accent-soft"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {preset} km
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <div className="flex justify-end">
        <Button onClick={save} disabled={!selected || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Volgende <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* --------------------------- step 2: artists ---------------------------- */

function StepArtists({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<ArtistCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [followingKey, setFollowingKey] = useState<string | null>(null);
  const [followed, setFollowed] = useState<FollowedArtist[]>([]);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [paste, setPaste] = useState("");
  const [importing, setImporting] = useState(false);
  const [importOutcome, setImportOutcome] = useState<ImportOutcome | null>(null);

  // Seed with artists the user ALREADY follows (returning users re-entering
  // onboarding shouldn't be locked behind the ≥1-follow gate).
  useEffect(() => {
    let alive = true;
    fetch("/api/artists/following", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { artists?: { id: string; name: string }[] } | null) => {
        if (!alive || !data?.artists?.length) return;
        setFollowed((prev) => {
          const seen = new Set(prev.map((f) => f.name.toLowerCase()));
          const extra = data.artists!
            .filter((a) => !seen.has(a.name.toLowerCase()))
            .map((a) => ({ name: a.name, artistId: a.id }));
          return [...prev, ...extra];
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) {
      setCandidates([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/artists/search?q=${encodeURIComponent(q)}`, {
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error("zoeken mislukt");
        const data: { candidates?: ArtistCandidate[] } = await res.json();
        setCandidates(data.candidates ?? []);
      } catch {
        setCandidates([]);
      } finally {
        setSearching(false);
        setSearched(true);
      }
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  const isFollowed = (name: string) =>
    followed.some((f) => f.name.toLowerCase() === name.toLowerCase());

  async function follow(c: ArtistCandidate) {
    const key = c.mbid ?? c.name;
    setFollowingKey(key);
    setError(null);
    try {
      const res = await fetch("/api/artists/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: c.name,
          mbid: c.mbid,
          sortName: c.sortName,
          disambiguation: c.disambiguation,
          country: c.country,
          genres: c.genres,
        }),
      });
      if (!res.ok) throw new Error("volgen mislukt");
      const data: { result?: { artistId: string; name: string } } = await res.json();
      const result = data.result;
      if (result && !isFollowed(result.name)) {
        setFollowed((prev) => [...prev, { name: result.name, artistId: result.artistId }]);
      }
    } catch {
      setError(`Kon "${c.name}" niet volgen. Probeer het opnieuw.`);
    } finally {
      setFollowingKey(null);
    }
  }

  async function importList() {
    const text = paste.trim();
    if (!text) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/import/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("import mislukt");
      const data: { outcome?: ImportOutcome } = await res.json();
      const outcome = data.outcome ?? { followed: [], ambiguous: [], notFound: [] };
      setImportOutcome(outcome);
      setFollowed((prev) => {
        const next = [...prev];
        for (const f of outcome.followed) {
          if (!next.some((x) => x.name.toLowerCase() === f.name.toLowerCase())) {
            next.push({ name: f.name, artistId: f.artistId });
          }
        }
        return next;
      });
      setPaste("");
    } catch {
      setError("Importeren van je lijst is mislukt. Probeer het opnieuw.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Wie wil je volgen?</h2>
        <p className="mt-1 text-sm text-white/55">
          Zoek je favoriete artiesten of plak in één keer een hele lijst. We houden hun
          tournees voor je in de gaten.
        </p>
      </div>

      {/* search */}
      <div className="space-y-2">
        <label className="text-sm text-white/70" htmlFor="onb-artist">
          Artiest zoeken
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            id="onb-artist"
            className="pl-9"
            placeholder="bv. Tame Impala, Stromae…"
            value={query}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/40" />
          ) : null}
        </div>

        {searched && !searching && candidates.length === 0 ? (
          <p className="text-sm text-white/45">Geen artiesten gevonden voor "{query.trim()}".</p>
        ) : null}

        {candidates.length > 0 ? (
          <ul className="space-y-2">
            {candidates.slice(0, 6).map((c, i) => {
              const key = c.mbid ?? `${c.name}-${i}`;
              const already = isFollowed(c.name);
              const busy = followingKey === (c.mbid ?? c.name);
              return (
                <li
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-bg-soft px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{c.name}</p>
                    <p className="truncate text-xs text-white/45">
                      {[c.disambiguation, c.country, c.genres?.slice(0, 2).join(", ")]
                        .filter(Boolean)
                        .join(" · ") || "Artiest"}
                    </p>
                  </div>
                  {already ? (
                    <Badge tone="success">
                      <Check className="h-3 w-3" /> Gevolgd
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={() => follow(c)}
                      disabled={busy}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                      Volg
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {/* paste list */}
      <div className="space-y-2">
        <label className="text-sm text-white/70" htmlFor="onb-paste">
          Of plak een lijst
        </label>
        <textarea
          id="onb-paste"
          className="input min-h-24 resize-y"
          placeholder={"Eén artiest per regel of komma-gescheiden:\nTame Impala\nStromae, Angèle"}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <Button
          type="button"
          variant="subtle"
          size="sm"
          onClick={importList}
          disabled={importing || paste.trim().length === 0}
        >
          {importing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ListPlus className="h-4 w-4" />
          )}
          Lijst importeren
        </Button>

        {importOutcome &&
        importOutcome.ambiguous.length + importOutcome.notFound.length > 0 ? (
          <div className="space-y-1 text-xs text-white/50">
            {importOutcome.ambiguous.length > 0 ? (
              <p>
                {importOutcome.ambiguous.length} naam(en) waren dubbelzinnig — voeg ze
                later toe via de artiestenpagina.
              </p>
            ) : null}
            {importOutcome.notFound.length > 0 ? (
              <p>Niet gevonden: {importOutcome.notFound.join(", ")}.</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* followed summary */}
      {followed.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-sm font-medium text-white/80">
            Je volgt nu {followed.length} artiest(en)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {followed.map((f) => (
              <Badge key={f.artistId} tone="accent">
                <Check className="h-3 w-3" /> {f.name}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Terug
        </Button>
        <div className="flex items-center gap-2">
          {followed.length === 0 ? (
            <Button variant="ghost" onClick={onDone}>
              Sla over
            </Button>
          ) : null}
          <Button onClick={onDone} disabled={followed.length === 0}>
            Volgende <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {followed.length === 0 ? (
        <p className="text-right text-xs text-white/50">
          Tip: volg minstens één artiest — je kan deze stap ook overslaan en later artiesten
          toevoegen.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------ step 3: notifications ------------------------- */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

type PushState = "idle" | "working" | "enabled" | "unavailable";

function StepNotifications({
  onBack,
  onFinish,
}: {
  onBack: () => void;
  onFinish: () => void;
}) {
  const [pushState, setPushState] = useState<PushState>("idle");
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [email, setEmail] = useState(true);
  const [inApp, setInApp] = useState(true);
  const [digest, setDigest] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // The VAPID public key is server-configured (VAPID_PUBLIC_KEY); fetch it
  // rather than relying on a build-time NEXT_PUBLIC_ variable.
  useEffect(() => {
    let alive = true;
    fetch("/api/push/public-key", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d: { publicKey?: string | null }) => {
        if (alive) setVapidKey(d.publicKey ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function enablePush() {
    setPushState("working");
    setNote(null);
    try {
      if (
        typeof window === "undefined" ||
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !vapidKey
      ) {
        setPushState("unavailable");
        setNote("Web push is niet beschikbaar — geen probleem, je krijgt nog steeds e-mail.");
        return;
      }
      // Register the service worker (needed before subscribing).
      await navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState("unavailable");
        setNote("Geen toestemming gegeven. Je kan dit later nog aanzetten in instellingen.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        }),
      });
      setPushState("enabled");
      setNote(null);
    } catch {
      setPushState("unavailable");
      setNote("Push aanzetten lukte niet — je krijgt nog steeds e-mail. Je kan dit later opnieuw proberen.");
    }
  }

  async function finish() {
    setSavingPrefs(true);
    try {
      await fetch("/api/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          webPush: pushState === "enabled",
          email,
          inApp,
          digest,
        }),
      });
    } catch {
      // Preferences are best-effort here; defaults apply server-side.
    } finally {
      setSavingPrefs(false);
      onFinish();
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Hoe wil je gewaarschuwd worden?</h2>
        <p className="mt-1 text-sm text-white/55">
          We laten je weten zodra een gevolgde artiest binnen je bereik speelt of tickets
          in de verkoop gaan. Jij kiest hoe.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-bg-soft p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent-soft">
            <BellRing className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white">Pushmeldingen in je browser</p>
            <p className="mt-0.5 text-sm text-white/55">
              De snelste manier om niets te missen. We vragen je toestemming.
            </p>
          </div>
        </div>
        <div className="mt-3">
          {pushState === "enabled" ? (
            <Badge tone="success">
              <Check className="h-3 w-3" /> Push staat aan
            </Badge>
          ) : (
            <Button
              type="button"
              variant="subtle"
              size="sm"
              onClick={enablePush}
              disabled={pushState === "working"}
            >
              {pushState === "working" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bell className="h-4 w-4" />
              )}
              Pushmeldingen toestaan
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Toggle
          label="E-mailmeldingen"
          description="Een mailtje bij relevante optredens."
          checked={email}
          onChange={setEmail}
        />
        <Toggle
          label="Meldingen in de app"
          description="Verzamel alles in je meldingencentrum."
          checked={inApp}
          onChange={setInApp}
        />
        <Toggle
          label="Wekelijkse samenvatting"
          description="Eén overzicht per week in plaats van losse meldingen."
          checked={digest}
          onChange={setDigest}
        />
      </div>

      {note ? <p className="text-sm text-amber-300">{note}</p> : null}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Terug
        </Button>
        <Button onClick={finish} disabled={savingPrefs}>
          {savingPrefs ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Klaar — naar dashboard <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-bg-soft px-3 py-2.5 text-left transition hover:bg-white/5"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="block text-xs text-white/50">{description}</span>
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          checked ? "bg-accent" : "bg-white/15"
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
            checked ? "left-[1.125rem]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
