# Tracktist — Architecture

This document describes how the pieces fit together. It follows the build brief
(§9 stack, §5 data pipeline, §10 data model, §11 internal API).

## Monorepo layout

```
@tracktist/core    UI-independent domain core (pure TS, no framework/DB)
@tracktist/web     Next.js flagship app (App Router) + Prisma/PostGIS + API routes
@tracktist/worker  BullMQ workers driving the sync pipeline on a schedule
```

The brief's standalone strategy: a **shared core** (`packages/core`) holds the
types, the provider/API client, and *all* sync/dedupe/distance logic, decoupled
from UI. Web is the flagship (full 3D globe via WebGL). Native (Expo/RN, 2D map
primary) and desktop (Tauri) come later on the same backend. Don't bet the
product on react-three-fiber-on-native.

## `@tracktist/core` modules

| Module | Responsibility | Brief |
|---|---|---|
| `types/` | Domain model: `Artist`, `Event`, `Venue`, `Anchor`, `EventProvider` | §5.1, §10 |
| `providers/` | `EventProvider` seam + Ticketmaster, Bandsintown, manual, setlist.fm; rate-limited HTTP | §4.1, §5.2 |
| `resolution/` | MusicBrainz client + `ArtistResolver` (name → MBID → external ids) | §4.3 |
| `dedupe/` | Merge the same show across sources into one canonical event | §5.3 |
| `confidence/` | 0–1 confidence score | §5.4 |
| `geo/` | Haversine distance + cross-border within-radius | §7 |
| `relevance/` | Weighted relevance score | §7 |
| `notifications/` | Eligibility rules, smart filters, idempotency key + change hash | §6.5 |
| `affiliate/` | Server-side affiliate ticket-link wrapping + click model | §8 |
| `pipeline/` | `monitorArtist` (artist-level) + `evaluateEventsForUser` (per-user) | §5.5 |

### The provider seam

Every concert source implements one interface:

```ts
interface EventProvider {
  readonly name: ProviderName;
  isEnabled(): boolean;
  fetchEventsForArtist(query: EventQuery): Promise<NormalizedEvent[]>;
}
```

Swapping or adding a source never touches dedupe, distance or the API. In v1
only `ticketmaster` and `bandsintown` are enabled. The HTTP helper centralises
rate limiting (≈2 req/s per source) and exponential backoff, and is fully
injectable so the pipeline runs offline in tests.

### The sync pipeline (§5.5)

```
                         ── artist level (shared across all users) ──
resolve(name) → MBID   monitorArtist():
  + external ids   →     fetch (TM ∥ BIT, with fallback)
                         → normalize  → dedupe  → canonical events
                                                       │
                         ── per user ──                ▼
                       evaluateEventsForUser():
                         distance per anchor → relevance → notification decision
```

Sync work is deduplicated at **artist level** (a shared pool keyed by MBID), not
per follow — so 1,000 users following the same artist cost one sync, matching the
brief's §5.2 budget model.

## Web app (`apps/web`)

- **Next.js App Router** + TypeScript + Tailwind + shadcn/ui. PWA layer
  (installable, web push).
- **API routes** implement the internal API (§11). All sync/dedupe/distance and
  the affiliate publisher id stay **server-side**.
- **Auth.js** with email magic link + Google (+ optional Apple/Spotify).
- **Prisma + PostgreSQL + PostGIS.** Coordinates are stored as columns *and* a
  generated `geography(Point,4326)` column with a GIST index for fast
  `ST_DWithin` "nearby" queries; `@tracktist/core` keeps a pure-Haversine path
  for logic/tests and environments without PostGIS.
- **Redis** for caching + BullMQ queues.

## Worker (`apps/worker`)

BullMQ queues + repeatable jobs (brief §5.2): daily scan per unique artist,
faster scan for must-see, ticket-status checks, distance recompute, notification
dispatch, data-quality sweep. Central rate-limiter per source, `last_synced_at`
per artist, priority queue.

## Data model (§10)

`User`, `UserLocation` (anchor), `Artist`, `ArtistExternalId`,
`UserArtistFollow`, `ArtistList`, `ArtistListItem`, `Event`, `EventArtist`,
`Venue`, `EventSource`, `EventRawPayload`, `Notification`,
`NotificationPreference`, `Friendship`, `Group`, `GroupMember`,
`GroupArtistFollow`, `GroupEventInterest`, `ProviderSyncLog`, `UserDevice`,
`CalendarIntegration`, `AffiliateClick`.

## Privacy & GDPR (§14)

Layered consent (location / notifications / contacts separately), coarse
location storage (anchor + radius, no continuous tracking in the web MVP),
full data export and account/data deletion, server-side secrets, rate limiting
on public endpoints. No scraping in production.
