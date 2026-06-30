# Spike 0 — Databewijs (data proof)

> Build this **before any UI** (brief §13). It de-risks the single biggest
> technical question: can we get reliable, deduplicated, cross-border concert
> data for real artists, with correct artist identity?

## What it proves

For three real, awkward artists — **The National** (cross-border touring),
**Amenra** (smaller / indie), and an **ambiguous name** — end-to-end and without
any UI:

1. **Identity** — `name → MBID → external ids` resolves via MusicBrainz, and an
   ambiguous name surfaces candidates instead of silently guessing.
2. **Events from two sources** — Ticketmaster **and** Bandsintown.
3. **Deduplication** — the same show from both sources collapses into one
   canonical event (e.g. *The National — AFAS Live — Amsterdam — 12/11/2026*).
4. **Cross-border distance** — from a fixed Dendermonde anchor (radius 350 km),
   NL/FR/DE/BE shows are flagged **within radius** and a New York show is not.

## Run it

```bash
pnpm spike0       # offline, bundled fixtures — no API keys required
pnpm test:core    # the automated acceptance tests (50+ assertions)
```

Against the live APIs:

```bash
TRACKTIST_LIVE=1 \
TICKETMASTER_API_KEY=… \
BANDSINTOWN_APP_ID=… \
MUSICBRAINZ_USER_AGENT="Tracktist/1.0 ( you@example.com )" \
pnpm spike0
```

## Example output (offline fixtures)

```
▶ The National
  MBID: mbid-the-national
  Spotify: 2cCUtGK9sDU2EvELDLpscX
  ✓ ticketmaster: 4 event(s)
  ✓ bandsintown: 2 event(s)
  TM attractionId (cached): K8vZ917o7-0
  → 5 canonical event(s) after dedupe:
    • 2026-11-12  Amsterdam (NL)  154.4 km  [WITHIN]  conf=1     src=T+B
    • 2026-11-15  Paris (FR)      266.8 km  [WITHIN]  conf=0.75  src=T
    • 2026-11-18  Köln (DE)       201.8 km  [WITHIN]  conf=0.75  src=T
    • 2026-11-20  Brussels (BE)    26.3 km  [WITHIN]  conf=0.75  src=B
    • 2026-12-01  New York (US)  5861.7 km  [outside] conf=0.75  src=T
```

`src=T+B` and `conf=1` on the Amsterdam row is the dedupe + confidence proof: two
independent sources, merged into one high-confidence canonical event.

## Acceptance criteria (met)

- [x] Identity resolves to a canonical MBID with external ids cached.
- [x] Events fetched from Ticketmaster **and** Bandsintown.
- [x] Duplicate shows merged into single canonical events (no double counting).
- [x] Cross-border NL/FR/DE shows correctly inside the radius; far shows outside.
- [x] Proven with seed/test data and automated tests (`pnpm test:core`).

## How it maps to the code

| Step | Code |
|---|---|
| name → MBID → external ids | `resolution/artist-resolver.ts`, `resolution/musicbrainz.ts` |
| fetch from each source | `providers/ticketmaster.provider.ts`, `providers/bandsintown.provider.ts` |
| normalize + dedupe | `pipeline/monitor-artist.ts`, `dedupe/dedupe.ts` |
| confidence | `confidence/confidence.ts` |
| cross-border distance | `geo/distance.ts`, `pipeline/evaluate-for-user.ts` |
| fixtures + offline fetch | `test/fixtures/*` |
