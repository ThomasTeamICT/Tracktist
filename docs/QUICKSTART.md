# Tracktist lokaal draaien — stap voor stap (voor beginners)

Je hebt niets van programmeerkennis nodig. Drie dingen installeren, daarna drie
commando's typen. Reken op ~10 minuten (vooral downloaden).

## 1. Installeer deze drie dingen

1. **Node.js** (versie 20 of nieuwer) — https://nodejs.org → "LTS" downloaden en
   installeren (gewoon "Volgende" klikken).
2. **Docker Desktop** — https://www.docker.com/products/docker-desktop → installeren
   en **opstarten** (laat het draaien op de achtergrond; dit levert de database).
3. **Git** — https://git-scm.com/downloads (of download de code als ZIP, zie stap 2).

> Na het installeren van Node: open één keer een terminal en typ `corepack enable`
> (dat zet `pnpm` aan, de tool die we gebruiken). Op Windows: gebruik
> **PowerShell**; op Mac: **Terminal** (Programma's → Hulpprogramma's).

## 2. Haal de code op

Met Git (terminal):
```bash
git clone <jouw-repo-url> Tracktist
cd Tracktist
git checkout claude/independent-build-cd5vvv
```
Geen Git? Ga op GitHub naar de branch `claude/independent-build-cd5vvv`, klik
**Code → Download ZIP**, pak uit, en open die map in je terminal (`cd pad/naar/map`).

## 3. Drie commando's

Typ ze één voor één (wacht tot elk klaar is):

```bash
pnpm install                        # installeert alles (1e keer duurt even)
pnpm bootstrap                      # maakt apps/web/.env aan, start de database + vult demo-data (Docker moet draaien)
pnpm dev                            # start de app
```

> `pnpm bootstrap` maakt automatisch een `.env`-bestand aan in **`apps/web/`**
> (op basis van `.env.example`) als het er nog niet staat. Eigen sleutels vul je
> dus in `apps/web/.env` in — niet in de hoofdmap.

Open daarna **http://localhost:3000** in je browser → je ziet de landingspagina. 🎉

## Meteen inloggen als demo-gebruiker (geen sleutels nodig)

Ga in je browser naar:

```
http://localhost:3000/api/dev/login
```

Je bent nu ingelogd als de demo-gebruiker (thuis in Dendermonde) en belandt op het
**dashboard**, met de demo-artiesten (The National + Amenra) en hun shows op de
agenda en de globe. Deze snel-login werkt **alleen lokaal** (in ontwikkelmodus) en
is in productie automatisch uitgeschakeld.

## Écht inloggen met je eigen account (optioneel, geavanceerd)

Wil je met een eigen account inloggen i.p.v. de demo, zet dan in `.env` één van beide:
- **Google**: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (via console.cloud.google.com)
- **E-mail magic link**: `EMAIL_SERVER` + `EMAIL_FROM` (een SMTP-server)

Vul dan ook `AUTH_SECRET` in (genereer er één met `openssl rand -base64 32`, of typ
gewoon een lange willekeurige tekst).

## Echte concertdata (optioneel)

Zonder sleutels draait alles op de demo-data. Voor échte, live concertdata zet je
in `.env`:
- `TICKETMASTER_API_KEY` (gratis via developer.ticketmaster.com)
- `BANDSINTOWN_APP_ID` (je eigen domeinnaam volstaat om te testen)

Daarna haalt de app automatisch shows op voor je gevolgde artiesten.

## Nieuwe versie ophalen (updaten)

Staat er een update klaar op de branch? Stop de app (`Ctrl + C`) en typ:

```bash
git pull
pnpm install
pnpm bootstrap      # past ook nieuwe database-migraties toe
pnpm dev
```

## Stoppen

- App stoppen: `Ctrl + C` in de terminal.
- Database stoppen: `pnpm db:down`.

## Iets kapot?

- "command not found: pnpm" → typ eerst `corepack enable`, open dan een nieuwe terminal.
- Foutmelding over de database → staat **Docker Desktop** aan? Draai `pnpm db:up` opnieuw.
- Poort 3000 bezet → sluit andere apps op die poort, of start met `PORT=3001 pnpm dev`.
