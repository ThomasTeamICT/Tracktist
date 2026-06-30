# Tracktist

> *Track your favourite artists — your personal live-music radar.*

Tracktist lets you follow your favourite artists and automatically tells you when
they play **within an adjustable radius around you — across borders**. You add
artists once (or import them); Tracktist detects new concert dates, deduplicates
them across sources, computes the distance from your location(s), and sends only
relevant, timely notifications.

This repository is a **TypeScript monorepo** built so the same backend can later
power desktop (Tauri/PWA) and native mobile (React Native), per the build brief.

## What's here

```
packages/
  core/         @tracktist/core — UI-independent domain core:
                types · provider layer · artist resolution · dedupe ·
                geo-distance · confidence · relevance · affiliate ·
                notification rules · sync pipeline.   (no UI, no DB)
apps/
  web/          Next.js flagship web app (PWA-ready) + Prisma/PostGIS + API
  worker/       BullMQ background workers (sync, distance, notifications)
docs/
  ARCHITECTURE.md   how the pieces fit together
  SPIKE0.md         the data-proof spike (build this first — and it's done)
```

## The overriding principle

> After adding artists, the user never has to search again. Tracktist detects new
> concert dates, deduplicates them, computes distance to the user's locations, and
> sends only relevant, timely notifications.

The biggest technical risk is **not** the UI or the 3D globe, but whether we can
get reliable, deduplicated, cross-border concert data for real artists with
correct artist identity. That is proven **first** — see [Spike 0](docs/SPIKE0.md).

## Quick start

```bash
# 1. Node 22 + pnpm 10
corepack enable

# 2. Install
pnpm install

# 3. Prove the data pipeline end-to-end (offline, no API keys needed)
pnpm spike0
pnpm test:core

# 4. Local infra (Postgres+PostGIS, Redis) for the web app
cp .env.example .env        # then fill in keys you have
pnpm db:up                  # docker compose: postgres + redis
pnpm db:migrate             # Prisma migrations (creates PostGIS schema)
pnpm dev                    # Next.js web app on http://localhost:3000
pnpm worker                 # background sync/notification workers
```

`pnpm spike0` runs entirely on bundled fixtures, so it works with **zero
configuration**. Set `TRACKTIST_LIVE=1` plus real keys to hit the live APIs.

## Key decisions (from the brief §3)

- **Independent of Spotify.** Core import is CSV/paste + Last.fm + MusicBrainz.
- **Event sources:** Ticketmaster Discovery (primary) + Bandsintown (secondary),
  both behind a swappable `EventProvider` interface. setlist.fm is context only;
  manual admin import is the fallback.
- **Artist identity:** MusicBrainz **MBID is the canonical key**; external ids
  map back to it.
- **Geo:** great-circle (Haversine) distance in core; PostGIS for scalable
  nearby queries. Borders are ignored unless the user filters by country.
- **Monetisation:** affiliate ticket links (server-side publisher id), no banners.
- **Privacy by design / GDPR:** layered consent, coarse location, export + delete.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full picture and
[`.env.example`](.env.example) for configuration.

## Status

- ✅ **Spike 0** — data proof (resolution → TM+BIT fetch → dedupe → cross-border
  distance) with automated tests. `pnpm spike0` · `pnpm test:core` (50 tests).
- ✅ **MVP (web)** — account (Auth.js: email magic link + Google), thuisanker +
  straal, artiest-import (zoeken / CSV-plak / Last.fm), automatische sync (TM +
  Bandsintown, dedupe), agenda + interactieve map/globe, web-push + e-mail +
  in-app meldingen met slimme regels, affiliate-getrackte ticketlinks,
  vrienden, instellingen. Full §11 API. Builds clean (`pnpm build`).
- ✅ **Backend bewezen tegen een echte PostGIS-database** — migraties, een
  PostGIS `ST_DWithin`-nabijheidsquery en een end-to-end integratietest
  (`pnpm --filter @tracktist/web test:integration`, 12 assertions): dedupe →
  persist → cross-border nearby → relevantie → idempotente notificaties.
- ⏭️ **Volgende (v1.5/v2)** — volwaardige 3D-globe (R3F/Globe.gl), vrienden-crews
  & gedeelde watchlists, wekelijkse digest, Pro-feature-flag, native app
  (echte push, geofencing), reisankers, kalendersync, co-occurrence-aanbevelingen.

### Verify everything

```bash
pnpm test:core                               # 50 core unit tests (incl. Spike 0)
pnpm spike0                                  # human-readable data proof (offline)
pnpm --filter @tracktist/web build           # production build of the web app
pnpm --filter @tracktist/web db:seed         # demo data into a local PostGIS db
pnpm --filter @tracktist/web test:integration # full backend, 12 assertions, real db
```

## License

UNLICENSED / private. Respect the terms of Ticketmaster, Bandsintown, Last.fm,
MusicBrainz/ListenBrainz and Spotify: attribution where required, no
redistribution of raw data, honour rate limits, no scraping in production.
