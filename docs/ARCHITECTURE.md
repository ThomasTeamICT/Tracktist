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

BullMQ repeatable jobs (brief §5.2): a daily scan per unique artist
(`SYNC_DAILY_CRON`), a faster scan (`SYNC_FAST_CRON`) and a weekly digest run
(`DIGEST_CRON`, Monday 08:00 by default). The worker is a thin scheduler — it
POSTs `/api/internal/tick` (constant-time secret check) and all real work
lives in the web app. It preflights Redis with a timeout and falls back to a
guarded in-process interval when Redis is absent; stale repeatable schedules
are reconciled on boot so changing a cron never double-fires.

## Notifications (§6.5)

Rules run in `@tracktist/core` (pure, tested): per-follow modes (`always`,
`within_distance`, `only_countries`, `only_with_tickets`, `only_new_tours`,
`dashboard_only`), global filters, and lifecycle alerts (cancelled/rescheduled)
that only fire for shows the user was actually told about. Delivery is a
separate phase in the web app: rows are created idempotently on a
`(user,event,anchor)` dedupe key + change hash, then web push is dispatched
outside the user's quiet hours (pending rows are retried by the next tick).
Digest-mode rows are bundled into ONE weekly summary push, idempotent per ISO
week.

## Images & assets

Fonts (Inter, Space Grotesk) and the globe's Earth textures are **self-hosted**
in `apps/web/public` — no third-party font/CDN requests (GDPR). Artist photos
come from the Deezer API server-side and are served to browsers through
`/api/img`, a strictly allowlisted same-origin proxy, so user IPs and referers
never reach the CDN.

## Data model (§10)

`User`, `UserLocation` (anchor), `Artist`, `ArtistExternalId`,
`UserArtistFollow`, `ArtistList`, `ArtistListItem`, `Event`, `EventArtist`,
`Venue`, `EventSource`, `EventRawPayload`, `Notification`,
`NotificationPreference`, `Friendship`, `Group`, `GroupMember`,
`GroupArtistFollow`, `GroupEventInterest`, `ProviderSyncLog`, `UserDevice`,
`CalendarIntegration`, `AffiliateClick`.

## Privacy & GDPR (§14)

Layered consent (location / notifications / contacts separately), coarse
location storage (anchors rounded to ~1 km; no continuous tracking in the web
MVP), full data export (including linked accounts, sessions, groups and
calendar links — never tokens) and account/data deletion (verification tokens
removed, owned groups transferred to another member, affiliate rows scrubbed
and pseudonymized), server-side secrets, rate limiting on public endpoints.
Affiliate sub-ids are hashed — the raw user id never leaves our systems.
Admin-only endpoints (manual event import) are gated by `ADMIN_EMAILS`.
No scraping in production.
