import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarCheck, ExternalLink, Globe, MapPin, Music2 } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getUserAgenda } from "@/lib/queries";
import { toGlobeEvent } from "@/lib/serialize";
import { fromDbNotifyMode, fromDbPriority } from "@/lib/mappers";
import { EventCard } from "@/components/event-card";
import { Badge, Button, SectionTitle } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { FollowRules } from "./follow-rules";

export const dynamic = "force-dynamic";

/** Build an outbound link for one of the artist's external sources. */
function externalLink(source: string, externalId: string, url: string | null): string | null {
  if (url) return url;
  switch (source) {
    case "SPOTIFY":
      return `https://open.spotify.com/artist/${externalId}`;
    case "MUSICBRAINZ":
      return `https://musicbrainz.org/artist/${externalId}`;
    default:
      return null;
  }
}

const SOURCE_LABEL: Record<string, string> = {
  WEBSITE: "Website",
  SPOTIFY: "Spotify",
  MUSICBRAINZ: "MusicBrainz",
};

export default async function ArtistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const [artist, follow, agenda] = await Promise.all([
    prisma.artist.findUnique({ where: { id }, include: { externalIds: true } }),
    prisma.userArtistFollow.findUnique({
      where: { userId_artistId: { userId: user.id, artistId: id } },
    }),
    getUserAgenda(user.id),
  ]);

  if (!artist) notFound();

  const events = agenda
    .filter((a) => a.db.artists.some((x) => x.artist.id === id))
    .map((a) => toGlobeEvent(a.evaluated, a.db.id));

  const links = artist.externalIds
    .map((x) => ({
      source: x.source as string,
      href: externalLink(x.source as string, x.externalId, x.url),
    }))
    .filter((x): x is { source: string; href: string } => Boolean(x.href));

  const lastSynced = artist.lastSyncedAt
    ? formatDate(artist.lastSyncedAt.toISOString().slice(0, 10))
    : null;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/artists"
          className="inline-flex items-center gap-1.5 text-sm text-white/55 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Terug naar artiesten
        </Link>
      </div>

      <header className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/5 text-accent-soft">
          {artist.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artist.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Music2 className="h-7 w-7" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-white">{artist.name}</h1>
          {artist.disambiguation ? (
            <p className="mt-0.5 text-white/55">{artist.disambiguation}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/50">
            {artist.country ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {artist.country}
              </span>
            ) : null}
            {lastSynced ? (
              <span className="inline-flex items-center gap-1">
                <Globe className="h-3.5 w-3.5" /> Laatst gesynchroniseerd op {lastSynced}
              </span>
            ) : (
              <span className="text-white/40">Nog niet gesynchroniseerd</span>
            )}
          </div>

          {artist.genres.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {artist.genres.map((g) => (
                <Badge key={g}>{g}</Badge>
              ))}
            </div>
          ) : null}

          {artist.bio ? <p className="mt-3 max-w-2xl text-sm text-white/60">{artist.bio}</p> : null}

          {links.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {links.map((l) => (
                <a key={l.source} href={l.href} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline">
                    <ExternalLink className="h-4 w-4" /> {SOURCE_LABEL[l.source] ?? l.source}
                  </Button>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="order-2 lg:order-1">
          <SectionTitle hint={`${events.length} optreden(s)`}>Komende optredens</SectionTitle>
          {events.length === 0 ? (
            <div className="card p-6 text-center">
              <CalendarCheck className="mx-auto h-8 w-8 text-white/30" />
              <p className="mt-3 text-white/60">
                {follow
                  ? "Nog geen optredens gevonden. We synchroniseren op de achtergrond — kijk straks nog eens."
                  : "Je volgt deze artiest niet, dus we tonen hier geen gepersonaliseerde optredens."}
              </p>
              {!follow ? (
                <div className="mt-4 flex justify-center">
                  <Link href="/artists">
                    <Button variant="outline">Artiest volgen</Button>
                  </Link>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {events.map((e) => (
                <EventCard key={e.eventId} event={e} />
              ))}
            </div>
          )}
        </section>

        <aside className="order-1 lg:order-2">
          {follow ? (
            <FollowRules
              artistId={artist.id}
              initial={{
                priority: fromDbPriority(follow.priority),
                mode: fromDbNotifyMode(follow.notifyMode),
                countryCodes: follow.countryCodes,
              }}
            />
          ) : (
            <div className="card p-5 text-center">
              <Music2 className="mx-auto h-7 w-7 text-white/30" />
              <p className="mt-3 text-sm text-white/60">
                Volg deze artiest om meldingsregels in te stellen.
              </p>
              <div className="mt-4 flex justify-center">
                <Link href="/artists">
                  <Button>Artiest volgen</Button>
                </Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
