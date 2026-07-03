"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapPin,
  LocateFixed,
  Search,
  Loader2,
  Check,
  Plus,
  Trash2,
  Pencil,
  X,
  Bell,
  BellRing,
  Mail,
  AppWindow,
  ShieldCheck,
  Download,
  Link2,
  AlertTriangle,
  Save,
  RefreshCw,
  CalendarRange,
} from "lucide-react";
import { Badge, Button, Card, Input, SectionTitle } from "@/components/ui";
import { subscribeToWebPush } from "@/lib/push-client";

/* ------------------------------ local types ------------------------------ */

interface Anchor {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  radiusKm: number;
  active: boolean;
  /** Travel anchors: only count within this window (ISO dates). */
  startDate: string | null;
  endDate: string | null;
}

interface Preferences {
  maxDistanceKm: number | null;
  countryCodes: string[];
  onlyMustSee: boolean;
  noFestivals: boolean;
  onlyWeekends: boolean;
  onlyWithTicketLink: boolean;
  onlyIfFriendsFollow: boolean;
  digest: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  webPush: boolean;
  email: boolean;
  inApp: boolean;
}

interface MeUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  preferredLanguage: string | null;
}

interface MeResponse {
  user: MeUser | null;
  preferences: Partial<Preferences> | null;
  anchors: Anchor[];
  followCount: number;
}

interface GeoPlace {
  label: string;
  lat: number;
  lng: number;
  city?: string;
  countryCode?: string;
}

const PREF_DEFAULTS: Preferences = {
  maxDistanceKm: null,
  countryCodes: [],
  onlyMustSee: false,
  noFestivals: false,
  onlyWeekends: false,
  onlyWithTicketLink: false,
  onlyIfFriendsFollow: false,
  digest: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  webPush: false,
  email: true,
  inApp: true,
};

const RADIUS_PRESETS = [50, 150, 300, 500] as const;

const TABS = [
  { id: "locations", label: "Locaties" },
  { id: "notifications", label: "Meldingen" },
  { id: "privacy", label: "Privacy & data" },
  { id: "accounts", label: "Verbonden accounts" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/* ------------------------------- component -------------------------------- */

export function SettingsClient() {
  const [tab, setTab] = useState<TabId>("locations");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(
    null,
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((tone: "success" | "danger" | "info", text: string) => {
    setToast({ tone, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me", { credentials: "same-origin" });
      if (!res.ok) throw new Error("kon je gegevens niet laden");
      const data: MeResponse = await res.json();
      setMe(data);
    } catch {
      setError("We konden je instellingen niet laden. Ververs de pagina of probeer het later opnieuw.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Instellingen</h1>
        <p className="text-white/55">Beheer je locaties, meldingen en gegevens.</p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Instellingen-secties">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => setTab(t.id)}
              className={`pill border transition ${
                active
                  ? "border-accent/40 bg-accent/20 text-accent-soft"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {loading ? (
        <div className="card flex items-center gap-3 p-6 text-white/60">
          <Loader2 className="h-5 w-5 animate-spin" /> Bezig met laden…
        </div>
      ) : error ? (
        <Card className="space-y-3">
          <p className="text-sm text-red-300">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Opnieuw proberen
          </Button>
        </Card>
      ) : me ? (
        <>
          {tab === "locations" ? (
            <LocationsSection
              anchors={me.anchors}
              onChange={(anchors) => setMe({ ...me, anchors })}
              notify={notify}
            />
          ) : null}
          {tab === "notifications" ? (
            <NotificationsSection
              initial={{ ...PREF_DEFAULTS, ...(me.preferences ?? {}) }}
              notify={notify}
            />
          ) : null}
          {tab === "privacy" ? <PrivacySection notify={notify} /> : null}
          {tab === "accounts" ? <AccountsSection user={me.user} /> : null}
        </>
      ) : null}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm shadow-glow backdrop-blur ${
            toast.tone === "success"
              ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
              : toast.tone === "danger"
                ? "border-red-400/30 bg-red-500/15 text-red-200"
                : "border-accent/30 bg-accent/15 text-accent-soft"
          }`}
        >
          {toast.tone === "success" ? (
            <Check className="h-4 w-4" />
          ) : toast.tone === "danger" ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------- shared switch ------------------------------- */

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-bg-soft px-3 py-2.5 text-left transition hover:bg-white/5 disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-white">{label}</span>
        {description ? <span className="block text-xs text-white/50">{description}</span> : null}
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

/* --------------------------- locations section ---------------------------- */

function LocationsSection({
  anchors,
  onChange,
  notify,
}: {
  anchors: Anchor[];
  onChange: (anchors: Anchor[]) => void;
  notify: (tone: "success" | "danger" | "info", text: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editRadius, setEditRadius] = useState(150);

  async function patchAnchor(id: string, patch: Partial<Anchor>) {
    setBusyId(id);
    const previous = anchors;
    onChange(anchors.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    try {
      const res = await fetch(`/api/me/locations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("update mislukt");
      const data: { anchor?: Anchor } = await res.json();
      if (data.anchor) {
        onChange(anchors.map((a) => (a.id === id ? { ...a, ...data.anchor } : a)));
      }
      notify("success", "Locatie bijgewerkt.");
    } catch {
      onChange(previous);
      notify("danger", "Bijwerken van de locatie is mislukt.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    const target = anchors.find((a) => a.id === id);
    if (!target) return;
    if (typeof window !== "undefined" && !window.confirm(`Locatie "${target.label}" verwijderen?`)) {
      return;
    }
    setBusyId(id);
    const previous = anchors;
    onChange(anchors.filter((a) => a.id !== id));
    try {
      const res = await fetch(`/api/me/locations/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("verwijderen mislukt");
      notify("success", "Locatie verwijderd.");
    } catch {
      onChange(previous);
      notify("danger", "Verwijderen van de locatie is mislukt.");
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(a: Anchor) {
    setEditId(a.id);
    setEditLabel(a.label);
    setEditRadius(a.radiusKm);
  }

  async function saveEdit(id: string) {
    const label = editLabel.trim();
    if (!label) {
      notify("danger", "Geef de locatie een naam.");
      return;
    }
    await patchAnchor(id, { label, radiusKm: editRadius });
    setEditId(null);
  }

  return (
    <section className="space-y-4">
      <SectionTitle hint={`${anchors.length} locatie(s)`}>Locaties &amp; ankers</SectionTitle>
      <p className="-mt-1 text-sm text-white/55">
        Je ankers bepalen waarbinnen een optreden als &ldquo;dichtbij&rdquo; telt. Zet een anker uit
        om hem tijdelijk te negeren zonder te verwijderen.
      </p>

      {anchors.length === 0 ? (
        <Card className="space-y-1 text-sm text-white/60">
          <p className="font-medium text-white">Nog geen locaties</p>
          <p>Voeg hieronder je thuisstad toe zodat we optredens binnen je bereik kunnen tonen.</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {anchors.map((a) => {
            const busy = busyId === a.id;
            const editing = editId === a.id;
            const place = [a.city, a.country].filter(Boolean).join(", ");
            return (
              <li key={a.id} className="card p-4">
                {editing ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-sm text-white/70" htmlFor={`label-${a.id}`}>
                        Naam
                      </label>
                      <Input
                        id={`label-${a.id}`}
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        maxLength={60}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-white/70" htmlFor={`radius-${a.id}`}>
                          Reisbereik
                        </label>
                        <Badge tone="accent">{editRadius} km</Badge>
                      </div>
                      <input
                        id={`radius-${a.id}`}
                        type="range"
                        min={25}
                        max={500}
                        step={25}
                        value={editRadius}
                        onChange={(e) => setEditRadius(Number(e.target.value))}
                        className="w-full accent-accent"
                        aria-label="Reisbereik in kilometer"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void saveEdit(a.id)} disabled={busy}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Opslaan
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditId(null)}
                        disabled={busy}
                      >
                        <X className="h-4 w-4" /> Annuleren
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold text-white">{a.label}</p>
                        {a.active ? (
                          <Badge tone="success">actief</Badge>
                        ) : (
                          <Badge tone="neutral">uit</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-white/50">
                        <MapPin className="h-3.5 w-3.5" />
                        {place || "Locatie onbekend"} · straal {a.radiusKm} km
                      </p>
                      {a.startDate || a.endDate ? (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-accent-soft/80">
                          <CalendarRange className="h-3.5 w-3.5" />
                          Reisanker: {a.startDate ? a.startDate.slice(0, 10) : "…"} →{" "}
                          {a.endDate ? a.endDate.slice(0, 10) : "…"}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Toggle
                        label={`Anker ${a.label} actief`}
                        checked={a.active}
                        disabled={busy}
                        onChange={(v) => void patchAnchor(a.id, { active: v })}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Locatie ${a.label} bewerken`}
                        onClick={() => startEdit(a)}
                        disabled={busy}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Locatie ${a.label} verwijderen`}
                        onClick={() => void remove(a.id)}
                        disabled={busy}
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-red-300" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AddAnchor
        onAdded={(anchor) => onChange([...anchors, anchor])}
        notify={notify}
      />
    </section>
  );
}

function AddAnchor({
  onAdded,
  notify,
}: {
  onAdded: (anchor: Anchor) => void;
  notify: (tone: "success" | "danger" | "info", text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<GeoPlace | null>(null);
  const [radius, setRadius] = useState(150);
  // Optional validity window → travel anchor ("op reis van … tot …").
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
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

  function reset() {
    setQuery("");
    setPlaces([]);
    setSelected(null);
    setRadius(150);
    setStartDate("");
    setEndDate("");
  }

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      notify("danger", "Locatie is niet beschikbaar in deze browser.");
      return;
    }
    setLocating(true);
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
        notify("danger", "Kon je locatie niet ophalen. Geef toestemming of zoek handmatig.");
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
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
        }),
      });
      if (!res.ok) throw new Error("opslaan mislukt");
      const data: { anchor?: Anchor } = await res.json();
      if (data.anchor) {
        onAdded(data.anchor);
        notify("success", "Locatie toegevoegd.");
      }
      reset();
      setOpen(false);
    } catch {
      notify("danger", "Toevoegen van de locatie is mislukt. Probeer het opnieuw.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="subtle" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Locatie toevoegen
      </Button>
    );
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Nieuwe locatie</h3>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Sluiten"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-white/70" htmlFor="add-place">
          Zoek een stad of plaats
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            id="add-place"
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

        <Button type="button" variant="subtle" size="sm" onClick={useMyLocation} disabled={locating}>
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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm text-white/70" htmlFor="add-radius">
            Reisbereik
          </label>
          <Badge tone="accent">{radius} km</Badge>
        </div>
        <input
          id="add-radius"
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

      {/* Travel anchor: an optional validity window (brief v2 — reisankers). */}
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm text-white/70">
          <CalendarRange className="h-4 w-4 text-accent-soft" />
          Tijdelijk anker (optioneel)
        </p>
        <p className="text-xs text-white/45">
          Op reis of tijdelijk ergens anders? Dit anker telt dan alleen mee voor shows binnen
          deze periode.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-white/50">
            Geldig vanaf
            <Input
              type="date"
              className="mt-1 w-full"
              value={startDate}
              max={endDate || undefined}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="block text-xs text-white/50">
            Geldig tot en met
            <Input
              type="date"
              className="mt-1 w-full"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={!selected || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Locatie toevoegen
        </Button>
      </div>
    </Card>
  );
}

/* -------------------------- notifications section ------------------------- */

function NotificationsSection({
  initial,
  notify,
}: {
  initial: Preferences;
  notify: (tone: "success" | "danger" | "info", text: string) => void;
}) {
  const [prefs, setPrefs] = useState<Preferences>(initial);
  const [saved, setSaved] = useState<Preferences>(initial);
  const [saving, setSaving] = useState(false);
  const [countryInput, setCountryInput] = useState("");

  const dirty = useMemo(() => JSON.stringify(prefs) !== JSON.stringify(saved), [prefs, saved]);

  function set<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  /** Turning push ON must actually subscribe this browser, not just save a flag. */
  async function togglePush(on: boolean) {
    if (!on) {
      set("webPush", false);
      return;
    }
    set("webPush", true);
    const result = await subscribeToWebPush();
    if (result !== "enabled") {
      set("webPush", false);
      notify(
        "danger",
        result === "denied"
          ? "Je browser gaf geen toestemming voor meldingen."
          : "Pushmeldingen zijn niet beschikbaar in deze browser.",
      );
    }
  }

  function addCountry() {
    const code = countryInput.trim().toUpperCase();
    setCountryInput("");
    if (code.length !== 2 || !/^[A-Z]{2}$/.test(code)) {
      notify("danger", "Geef een 2-letterige landcode, bv. BE of NL.");
      return;
    }
    if (prefs.countryCodes.includes(code)) return;
    set("countryCodes", [...prefs.countryCodes, code]);
  }

  function removeCountry(code: string) {
    set(
      "countryCodes",
      prefs.countryCodes.filter((c) => c !== code),
    );
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          maxDistanceKm: prefs.maxDistanceKm,
          countryCodes: prefs.countryCodes,
          onlyMustSee: prefs.onlyMustSee,
          noFestivals: prefs.noFestivals,
          onlyWeekends: prefs.onlyWeekends,
          onlyWithTicketLink: prefs.onlyWithTicketLink,
          onlyIfFriendsFollow: prefs.onlyIfFriendsFollow,
          digest: prefs.digest,
          quietHoursStart: prefs.quietHoursStart || null,
          quietHoursEnd: prefs.quietHoursEnd || null,
          webPush: prefs.webPush,
          email: prefs.email,
          inApp: prefs.inApp,
        }),
      });
      if (!res.ok) throw new Error("opslaan mislukt");
      const data: { preferences?: Partial<Preferences> } = await res.json();
      const next = { ...prefs, ...(data.preferences ?? {}) };
      setPrefs(next);
      setSaved(next);
      notify("success", "Meldingsvoorkeuren opgeslagen.");
    } catch {
      notify("danger", "Opslaan van je voorkeuren is mislukt. Probeer het opnieuw.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5">
      <SectionTitle hint="bepaal wat en hoe je hoort">Meldingen</SectionTitle>

      {/* channels */}
      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-white">Kanalen</h3>
        <div className="space-y-2">
          <Toggle
            label="Pushmeldingen"
            description="Realtime meldingen in je browser."
            checked={prefs.webPush}
            onChange={(v) => void togglePush(v)}
          />
          <Toggle
            label="E-mail"
            description="Een mailtje bij relevante optredens."
            checked={prefs.email}
            onChange={(v) => set("email", v)}
          />
          <Toggle
            label="In de app"
            description="Verzamel alles in je meldingencentrum."
            checked={prefs.inApp}
            onChange={(v) => set("inApp", v)}
          />
        </div>
      </Card>

      {/* frequency */}
      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-white">Frequentie</h3>
        <Toggle
          label="Wekelijkse samenvatting"
          description={
            prefs.digest
              ? "Eén overzicht per week in plaats van losse meldingen."
              : "Directe meldingen zodra er iets relevants is."
          }
          checked={prefs.digest}
          onChange={(v) => set("digest", v)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm text-white/70" htmlFor="quiet-start">
              Stilteperiode van
            </label>
            <Input
              id="quiet-start"
              type="time"
              value={prefs.quietHoursStart ?? ""}
              onChange={(e) => set("quietHoursStart", e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-white/70" htmlFor="quiet-end">
              tot
            </label>
            <Input
              id="quiet-end"
              type="time"
              value={prefs.quietHoursEnd ?? ""}
              onChange={(e) => set("quietHoursEnd", e.target.value || null)}
            />
          </div>
        </div>
        <p className="text-xs text-white/45">
          Tijdens de stilteperiode sturen we geen pushmeldingen. Laat leeg om altijd meldingen te
          ontvangen.
        </p>
      </Card>

      {/* filters */}
      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-white">Filters</h3>
        <div className="space-y-2">
          <Toggle
            label="Alleen 'must-see'"
            description="Enkel artiesten die je als topprioriteit markeerde."
            checked={prefs.onlyMustSee}
            onChange={(v) => set("onlyMustSee", v)}
          />
          <Toggle
            label="Geen festivals"
            description="Sla festivaloptredens over."
            checked={prefs.noFestivals}
            onChange={(v) => set("noFestivals", v)}
          />
          <Toggle
            label="Alleen weekends"
            description="Enkel optredens op vrijdag, zaterdag of zondag."
            checked={prefs.onlyWeekends}
            onChange={(v) => set("onlyWeekends", v)}
          />
          <Toggle
            label="Alleen met ticketlink"
            description="Enkel als er al tickets te koop zijn."
            checked={prefs.onlyWithTicketLink}
            onChange={(v) => set("onlyWithTicketLink", v)}
          />
          <Toggle
            label="Alleen als vrienden volgen"
            description="Enkel artiesten die ook een vriend volgt."
            checked={prefs.onlyIfFriendsFollow}
            onChange={(v) => set("onlyIfFriendsFollow", v)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-white/70" htmlFor="max-distance">
            Maximale afstand (km)
          </label>
          <Input
            id="max-distance"
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="Geen limiet"
            value={prefs.maxDistanceKm ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (v === "") {
                set("maxDistanceKm", null);
                return;
              }
              const n = Number(v);
              set("maxDistanceKm", Number.isFinite(n) && n > 0 ? Math.round(n) : null);
            }}
          />
          <p className="text-xs text-white/45">
            Meld enkel optredens binnen deze afstand van een actief anker. Laat leeg voor geen
            limiet.
          </p>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm text-white/70">Landen</span>
          <p className="text-xs text-white/45">
            Beperk meldingen tot specifieke landen (2-letterige codes). Laat leeg voor alle landen.
          </p>
          {prefs.countryCodes.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {prefs.countryCodes.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => removeCountry(c)}
                  className="pill border border-accent/40 bg-accent/20 text-accent-soft transition hover:bg-accent/30"
                  aria-label={`Land ${c} verwijderen`}
                >
                  {c} <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Input
              className="w-24"
              placeholder="bv. BE"
              maxLength={2}
              value={countryInput}
              onChange={(e) => setCountryInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCountry();
                }
              }}
              aria-label="Landcode toevoegen"
            />
            <Button type="button" variant="subtle" size="sm" onClick={addCountry}>
              <Plus className="h-4 w-4" /> Toevoegen
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {dirty ? <span className="text-xs text-white/45">Niet-opgeslagen wijzigingen</span> : null}
        <Button onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Voorkeuren opslaan
        </Button>
      </div>
    </section>
  );
}

/* ---------------------------- privacy section ----------------------------- */

function PrivacySection({
  notify,
}: {
  notify: (tone: "success" | "danger" | "info", text: string) => void;
}) {
  return (
    <section className="space-y-4">
      <SectionTitle hint="jouw gegevens, jouw controle">Privacy &amp; data</SectionTitle>

      <Card className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent-soft">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="space-y-2 text-sm text-white/65">
            <p className="font-medium text-white">Hoe we je locatie bewaren</p>
            <p>
              We slaan je locatie bewust <strong className="text-white/80">grof</strong> op: enkel
              een ankerpunt (stad/coördinaat) en een straal. We volgen je niet in realtime en bouwen
              geen bewegingsprofiel op. Je ankers gebruiken we alleen om te bepalen welke optredens
              binnen jouw bereik vallen.
            </p>
            <p>
              Je kan locaties op elk moment aanpassen of verwijderen onder het tabblad
              &ldquo;Locaties&rdquo;.
            </p>
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-white">Exporteer mijn data</p>
          <p className="text-sm text-white/55">
            Download een kopie van je profiel, gevolgde artiesten, locaties en voorkeuren (GDPR
            inzage- en overdraagbaarheidsrecht).
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            notify("info", "Je data-export wordt gedownload…");
            if (typeof window !== "undefined") window.location.href = "/api/me/export";
          }}
        >
          <Download className="h-4 w-4" /> Exporteer mijn data
        </Button>
      </Card>

      <Card className="space-y-3 border-red-500/20">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            <AlertTriangle className="h-4 w-4 text-red-300" /> Verwijder mijn account
          </p>
          <p className="text-sm text-white/55">
            Verwijdert je account met alle gevolgde artiesten, locaties en voorkeuren. Deze actie is
            onomkeerbaar (GDPR recht op vergetelheid).
          </p>
        </div>
        <Button
          variant="danger"
          onClick={async () => {
            if (
              typeof window !== "undefined" &&
              !window.confirm(
                "Weet je zeker dat je je account wil verwijderen? Deze actie is onomkeerbaar.",
              )
            ) {
              return;
            }
            try {
              const res = await fetch("/api/me", { method: "DELETE", credentials: "same-origin" });
              if (!res.ok) throw new Error("verwijderen mislukt");
              notify("success", "Je account is verwijderd. Tot ziens!");
              if (typeof window !== "undefined") window.location.href = "/";
            } catch {
              notify("danger", "Account verwijderen is mislukt. Probeer later opnieuw.");
            }
          }}
        >
          <Trash2 className="h-4 w-4" /> Verwijder mijn account
        </Button>
      </Card>
    </section>
  );
}

/* ---------------------------- accounts section ---------------------------- */

function AccountsSection({ user }: { user: MeUser | null }) {
  // Reflect the browser's REAL push subscription instead of a hardcoded "no".
  const [pushConnected, setPushConnected] = useState(false);
  useEffect(() => {
    let alive = true;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => {
        if (alive) setPushConnected(Boolean(sub));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const providers = [
    {
      key: "email",
      label: "E-mail",
      icon: <Mail className="h-4 w-4" />,
      connected: Boolean(user?.email),
      detail: user?.email ?? null,
    },
    {
      key: "push",
      label: "Pushmeldingen",
      icon: <BellRing className="h-4 w-4" />,
      connected: pushConnected,
      detail: pushConnected ? "deze browser" : null,
    },
    {
      key: "inapp",
      label: "In-app meldingen",
      icon: <AppWindow className="h-4 w-4" />,
      connected: true,
      detail: null,
    },
  ];

  return (
    <section className="space-y-4">
      <SectionTitle hint="informatief">Verbonden accounts</SectionTitle>
      <p className="-mt-1 text-sm text-white/55">
        Een overzicht van de kanalen die aan je Tracktist-account gekoppeld zijn.
      </p>

      <Card className="space-y-2">
        {providers.map((p) => (
          <div
            key={p.key}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-bg-soft px-3 py-2.5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5 text-accent-soft">
                {p.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{p.label}</p>
                {p.detail ? <p className="truncate text-xs text-white/45">{p.detail}</p> : null}
              </div>
            </div>
            {p.connected ? (
              <Badge tone="success">
                <Check className="h-3 w-3" /> Verbonden
              </Badge>
            ) : (
              <Badge tone="neutral">
                <Link2 className="h-3 w-3" /> Niet verbonden
              </Badge>
            )}
          </div>
        ))}
      </Card>

      <CalendarFeedCard />

      <p className="text-xs text-white/40">
        Het beheren van externe providers (zoals Spotify of Last.fm) wordt in een latere stap
        toegevoegd.
      </p>
    </section>
  );
}

/* ------------------------- calendar feed (iCal) --------------------------- */

function CalendarFeedCard() {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/me/calendar-feed", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { url?: string | null } | null) => {
        if (alive) setUrl(d?.url ?? null);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function createOrRotate() {
    setBusy(true);
    try {
      const res = await fetch("/api/me/calendar-feed", { method: "POST", credentials: "same-origin" });
      if (res.ok) {
        const d: { url?: string } = await res.json();
        setUrl(d.url ?? null);
        setCopied(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!window.confirm("Agenda-feed intrekken? Gekoppelde kalenders stoppen met verversen.")) return;
    setBusy(true);
    try {
      await fetch("/api/me/calendar-feed", { method: "DELETE", credentials: "same-origin" });
      setUrl(null);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard unavailable — the URL stays visible for manual copy */
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Agenda-feed (iCal)</h3>
          <p className="mt-0.5 text-sm text-white/55">
            Abonneer je kalender (Google, Apple, Outlook) op al je komende shows. De feed
            ververst zichzelf — nooit meer handmatig toevoegen.
          </p>
        </div>
        {url ? (
          <Badge tone="success">
            <Check className="h-3 w-3" /> Actief
          </Badge>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-white/45">Laden…</p>
      ) : url ? (
        <>
          <div className="flex items-center gap-2">
            <Input readOnly value={url} className="flex-1 text-xs" aria-label="Agenda-feed URL" />
            <Button size="sm" variant="subtle" onClick={() => void copy()}>
              {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
              {copied ? "Gekopieerd" : "Kopieer"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void createOrRotate()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Vernieuw link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void revoke()} disabled={busy}>
              <Trash2 className="h-4 w-4" /> Intrekken
            </Button>
            <span className="text-xs text-white/40">
              Vernieuwen maakt de oude link ongeldig — handig als je hem per ongeluk deelde.
            </span>
          </div>
        </>
      ) : (
        <div>
          <Button size="sm" onClick={() => void createOrRotate()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Maak agenda-feed
          </Button>
        </div>
      )}
    </Card>
  );
}
