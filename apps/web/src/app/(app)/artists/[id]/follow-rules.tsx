"use client";

import { useState } from "react";
import { Bell, Check, Loader2, X } from "lucide-react";
import { Badge, Button } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Types (match the documented preferences contract)                  */
/* ------------------------------------------------------------------ */

type Priority = "low" | "normal" | "high" | "must_see";
type NotifyMode =
  | "always"
  | "within_distance"
  | "only_countries"
  | "only_new_tours"
  | "only_with_tickets"
  | "dashboard_only";

export interface FollowRulesValue {
  priority: Priority;
  mode: NotifyMode;
  countryCodes: string[];
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "low", label: "Laag" },
  { value: "normal", label: "Normaal" },
  { value: "high", label: "Hoog" },
  { value: "must_see", label: "Niet missen" },
];

const MODES: { value: NotifyMode; label: string; hint: string }[] = [
  { value: "always", label: "Altijd", hint: "Elk optreden, waar ook ter wereld." },
  { value: "within_distance", label: "Binnen mijn straal", hint: "Alleen shows dicht bij een anker." },
  { value: "only_countries", label: "Enkel in landen", hint: "Alleen in de landen die je hieronder kiest." },
  { value: "only_new_tours", label: "Enkel nieuwe tours", hint: "Alleen wanneer een nieuwe tour wordt aangekondigd." },
  { value: "only_with_tickets", label: "Enkel met tickets", hint: "Alleen shows met een ticketlink." },
  { value: "dashboard_only", label: "Alleen dashboard", hint: "Geen meldingen, enkel zichtbaar in je overzicht." },
];

/* ------------------------------------------------------------------ */

export function FollowRules({
  artistId,
  initial,
}: {
  artistId: string;
  initial: FollowRulesValue;
}) {
  const [priority, setPriority] = useState<Priority>(initial.priority);
  const [mode, setMode] = useState<NotifyMode>(initial.mode);
  const [countryCodes, setCountryCodes] = useState<string[]>(initial.countryCodes);
  const [countryInput, setCountryInput] = useState("");

  // Last successfully saved values, so the form can detect unsaved changes.
  const [baseline, setBaseline] = useState<FollowRulesValue>(initial);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const dirty =
    priority !== baseline.priority ||
    mode !== baseline.mode ||
    countryCodes.join(",") !== baseline.countryCodes.join(",");

  function addCountry() {
    const code = countryInput.trim().toUpperCase();
    setCountryInput("");
    if (code.length !== 2 || !/^[A-Z]{2}$/.test(code)) return;
    if (countryCodes.includes(code)) return;
    setCountryCodes((prev) => [...prev, code]);
    setStatus("idle");
  }

  function removeCountry(code: string) {
    setCountryCodes((prev) => prev.filter((c) => c !== code));
    setStatus("idle");
  }

  async function save() {
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch(`/api/user-artists/${artistId}/preferences`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority, mode, countryCodes }),
      });
      if (!res.ok) throw new Error();
      // Keep the baseline in sync so the form is no longer "dirty".
      setBaseline({ priority, mode, countryCodes: [...countryCodes] });
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  const activeMode = MODES.find((m) => m.value === mode);

  return (
    <div className="card flex flex-col gap-5 p-5">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-accent-soft">
          <Bell className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-semibold text-white">Meldingsregels</h2>
          <p className="text-xs text-white/50">Bepaal wanneer we je over deze artiest verwittigen.</p>
        </div>
      </div>

      <label className="block text-xs text-white/50">
        Prioriteit
        <select
          className="input mt-1 w-full"
          value={priority}
          disabled={saving}
          onChange={(e) => {
            setPriority(e.target.value as Priority);
            setStatus("idle");
          }}
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs text-white/50">
        Wanneer melden
        <select
          className="input mt-1 w-full"
          value={mode}
          disabled={saving}
          onChange={(e) => {
            setMode(e.target.value as NotifyMode);
            setStatus("idle");
          }}
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        {activeMode ? <span className="mt-1 block text-xs text-white/40">{activeMode.hint}</span> : null}
      </label>

      {mode === "only_countries" ? (
        <div className="text-xs text-white/50">
          Landen (ISO-code, bv. BE)
          <div className="mt-1 flex gap-2">
            <input
              className="input w-full"
              value={countryInput}
              placeholder="BE"
              maxLength={2}
              disabled={saving}
              aria-label="Landcode toevoegen"
              onChange={(e) => setCountryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCountry();
                }
              }}
            />
            <Button type="button" size="sm" variant="subtle" disabled={saving} onClick={addCountry}>
              Toevoegen
            </Button>
          </div>
          {countryCodes.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {countryCodes.map((code) => (
                <Badge key={code} tone="accent">
                  {code}
                  <button
                    type="button"
                    className="ml-1 text-accent-soft/70 hover:text-white"
                    aria-label={`${code} verwijderen`}
                    onClick={() => removeCountry(code)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-white/40">Nog geen landen gekozen.</p>
          )}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Opslaan
        </Button>
        {status === "saved" ? <span className="text-xs text-emerald-300">Opgeslagen.</span> : null}
        {status === "error" ? <span className="text-xs text-red-300">Opslaan mislukt — probeer opnieuw.</span> : null}
      </div>
    </div>
  );
}
