# Grail Wars

A browser multiplayer party game inspired by the *Fate* Holy Grail War — a non-commercial fan project.

A host creates a room and shares a **4-letter code**. Up to 7 friends (14 in Extended War) each draft **one character from any fiction or history for each class in play** — the seven standard Servant classes, plus **Shielder, Ruler and Avenger** if the host switches them on. When the game starts, everyone is randomly assigned one class and one character from that pool, and the host picks a mode:

| Mode | What happens |
|---|---|
| **⚔️ Web-Driven War** | The server researches every summoned character on the web, power-scales them from their peak feats, and plays out a **5-day story-driven war** one event at a time — Hunger-Games-Simulator style, with portraits, a live roster, and a "Why?" panel explaining every result. |
| **🗣️ Debate Arena** | Every Master drafts a character for every class, the Grail hands each of them **one** of their picks, and random 1v1 matchups are argued and voted on in timed rounds until one champion remains. **Three Masters minimum** — every Master votes in every match, including the two whose Servants are fighting, so the room needs a third ballot to break a tie. An uneven field sends one random character through on a bye; a window nobody votes in is re-run once before the host decides. |
| **🕹️ Interactive War** *(coming soon)* | A war you steer by hand: Masters make the calls between events instead of watching the AI play the whole thing out. The card is in the lobby today — greyed, with a *Coming soon* badge — and the mode itself is not built yet. |

Character portraits are found automatically and can be overridden with an upload or a pasted link.

### Lobby options worth knowing

- **Classes in this war.** Every class is a toggle. The first seven are on by default; Shielder, Ruler and Avenger are off until you turn them on. Each selected class adds a draft slot for every Master.
- **Narration.** Three voices: `Templated` (the default corpus), `Hunger Games` (tributes, sponsors, the Cornucopia and a cannon for every death) and `Fate` (the Grail, Command Seals, Spirit Origins, the Throne of Heroes). A room saved with the retired `AI Enhanced` style still loads — it falls back to templated narration unless an LLM key is configured.
- **War location.** The war happens in a real city. Choose **Let AI Decide** and one is drawn at random, or **Let Players Choose** and a random Master picks from three random real-world cities. The setting feeds into the narration — a war in New York City gets Servants using the skyline for surveillance; one in Kathmandu gets thin air and long sight lines.
- **Character search returns people only.** Every candidate is classified before it reaches the draft, so typing `lancer` will not offer you the Mitsubishi Lancer, `assassin` will not offer you "assassination", and `saber` will not offer you a software package. Anime, manga, film, TV, games, real historical figures and mythological figures are all fair game; the "use exactly what I typed" row is always there as an escape hatch.

**The fights are not random.** Outcomes come from power-scaling with explicit, visible modifiers (tier, speed, durability, class advantage, injuries, ambushes, ability counters). Randomness appears only inside a narrow toss-up band, and even then it is seeded and labelled as such.

> **Screenshots:** _placeholder — drop images in `docs/` and link them here._

---

## Quick start

Requires **Node.js 22 or newer** (developed and deployed on the Node 24 LTS line — Node 20
reached end-of-life in April 2026). No database, no build server, no accounts.

```bash
npm install
cp .env.example .env      # every value is optional
npm run dev
```

- Client: <http://localhost:5173>
- Server: <http://localhost:3000> (`/healthz` for a liveness check)

`npm run dev` runs both processes together. Open the client in two browser tabs, create a room in one, and join with the code in the other.

### Everything works with no API keys

With a blank `.env` the game is fully playable: narration comes from 140+ text templates, images come from public wikis, and every character falls back to a generated SVG avatar. Keys only make optional things nicer.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Server + client with hot reload |
| `npm run build` | Builds the client into `client/dist` |
| `npm start` | Runs the production server (serves the built client, API, and sockets on one port) |
| `npm test` | Server test suite (Vitest) |
| `npm run typecheck` | Strict TypeScript check across server and client |
| `npm run sim -- --seed 7 --players 5 --days 5 --offline` | Prints a full readable war in the terminal — no browser needed. Add `--style hunger_games` (or `fate`) and `--location new-york` to preview narration styles and settings |
| `npm run oracle` | Probes the power-scaling engine against well-known characters and sanity-checks the tiers |
| `npm run images` | Audits picture coverage for the offline fallback roster (`--class saber`, `--limit 20`, `--verbose`); exits non-zero if any character has no real artwork |
| `npm run smoke` | End-to-end game over the real Socket.IO API (`--players 5 --days 5`, `--mode DEBATE`, `--rooms 30` for a load test) |

`npm run sim` is the quickest way to inspect the story engine; `npm run oracle` is the quickest way to notice when a wiki layout changes and breaks stat parsing.

---

## Optional configuration

All of these live in `.env` (see [.env.example](.env.example)).

**LLM (optional).** Set `LLM_PROVIDER` to `gemini`, `groq`, or `openrouter` plus the matching key to enable profile extraction from wiki text and `AI-enhanced` narration. It is strictly a polish layer: outputs are validated against the participant list and rejected if they change who fought, won, or died.

**Images (optional).** `TMDB_API_KEY` improves movie/TV portraits; `IMAGE_SEARCH_PROVIDER=brave` (or `google_cse`) adds a general image search to the fallback chain. Without them the waterfall still works from AniList, VS Battles, Wikipedia, and Fandom, and always ends in a generated avatar.

**`CONTACT_EMAIL`** is the public contact address: it is placed in the `User-Agent` when the server calls public wikis and APIs, and it is the address this README names for takedown requests. Set it if you deploy publicly.

**Feedback form (optional).** The **Contact** page posts to `POST /api/feedback`. Set `FEEDBACK_TO` to the inbox messages should reach — a dedicated address, not your personal one — and `FEEDBACK_WEBHOOK_URL` to any endpoint that turns a JSON POST into an email. Both live only in the server environment; neither is ever sent to the browser. With no webhook configured, submissions are logged and kept in memory so the form still gives the visitor a clean success state, but no email is sent. A free [Google Apps Script](https://script.google.com) web app is the zero-dependency option: create it in the `FEEDBACK_TO` account, put that same address on its `INBOX` line — the script decides the recipient, the payload's `to` is only a label — deploy it with **Execute as: Me** and **Who has access: Anyone**, and use the URL ending in `/exec` as `FEEDBACK_WEBHOOK_URL`. Keep the recipient hardcoded so the URL cannot be used as a relay. Gmail always sends from the account that owns the script, so a message *looks* like it came from you; the recipe below prints the visitor's own address at the top of the body and sets `Reply-To`, which is how you write back. The payload carries that address as both `email` and `replyTo` (the field is optional, so it can be blank):

```js
// Set this to the FEEDBACK_TO address — the one place the inbox is written.
const INBOX = 'your-inbox@gmail.com';

function doPost(e) {
  const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  const name = data.name || 'Anonymous';
  // The server sends both keys; accept either.
  const email = data.email || data.replyTo || '';
  const lines = [
    `Name:  ${name}`,
    `Email: ${email || '(not given)'}`,
    `Topic: ${data.topic || 'other'}`,
    '',
    data.message || '(empty)',
    '',
    `Sent from the Grail Wars contact form.`,
  ];
  MailApp.sendEmail({
    to: INBOX, // fixed — never taken from the request
    subject: `Grail Wars feedback (${data.topic || 'other'}) — ${name}`,
    body: lines.join('\n'),
    replyTo: email || undefined,
    name: 'Grail Wars Feedback',
  });
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

After you edit the script, deploy a new version — **Deploy → Manage deployments → Edit → New version** — or that URL keeps running the old code. If a message never arrives, open the project's **Executions** page: *Completed* means Google did run `doPost` (so check where `INBOX` points, and the inbox's spam folder), while a failed entry carries the error it threw.

A free [Formspree](https://formspree.io) form works too — it emails the form's owner.

---

## Publish it for free

The whole game is a **single Node process**: it serves the website, the API and the
websockets on one port, and it does its research on the way through. Rooms, drafted
Servants and the war in progress live in its **memory**, so run **exactly one
instance** — two would each hold half of everybody's games.

### Render (recommended — free, no credit card)

[render.yaml](render.yaml) is a Render blueprint that deploys exactly that: one free
Node web service, with the client built during deploy and served by the same process
that owns the API and the sockets.

1. Sign in at [render.com](https://render.com) with GitHub — no payment method is
   needed for a free instance.
2. **New → Blueprint**, pick this repository, and apply. Render reads `render.yaml`,
   installs with the lockfile, builds the client, and starts the server.
3. It prompts for the addresses the blueprint cannot know: **`CONTACT_EMAIL`** —
   your public contact address, sent in the `User-Agent` to public wikis and APIs —
   and optionally **`FEEDBACK_TO`** / **`FEEDBACK_WEBHOOK_URL`** if you want the
   Contact form to email you (see *Optional configuration*). Every other value in
   the blueprint can stay blank.
4. The first build takes a few minutes. You then have
   `https://<service-name>.onrender.com` with HTTPS, WebSockets on the same origin,
   and `/healthz` as the health check.

| Free-plan fact | What it means for a game night |
|---|---|
| 512 MB RAM, 0.1 CPU, one instance | Plenty for seven players; the work is waiting on wikis, not crunching numbers. One instance is also what the in-memory design needs. |
| 750 instance hours a month | One service can run around the clock; a service that sleeps spends no hours. |
| Sleeps after 15 minutes without inbound traffic, wakes in about half a minute (32 s measured) | Sleeping is the idle state: with nobody in a room the service goes quiet, Render spins it down, and the next request wakes it while that visitor sees a loading page. |
| A sleep, restart or deploy wipes memory | A game nobody is watching does not survive it. But the client sends a small keepalive every 4 minutes while a room is open, so an *active* session never goes quiet long enough to sleep. Rooms still end on their own after 4 idle hours. |
| 5 GB of outbound bandwidth a month | Portraits are proxied through the server; a whole war is a few megabytes. Past the cap, a workspace with no payment method has its free services suspended until the month rolls over. |

**When it sleeps — and why that is normal.** A deploy counts as traffic, and so does
every visitor; fifteen quiet minutes after the last one the service sleeps, and
nothing about that is a fault. The client's keepalive protects a *game in progress*,
not the site: it fires every four minutes while a room is on screen, and when nothing
is open there is nothing to send. So a site left alone is asleep when the next visitor
arrives, and their first request holds the loading page for about half a minute before
the game appears — unless a pinger below is keeping it warm.

**Keeping it warm (optional).** A free uptime pinger — [cron-job.org](https://cron-job.org)
or [UptimeRobot](https://uptimerobot.com), for example — hitting
`https://<service-name>.onrender.com/healthz` every 5–10 minutes keeps the service
awake, so no visitor ever sees a cold start. It spends real hours, though: an
always-warm service uses about 744 of the 750 free instance hours in a month, leaving
almost no margin, and the service is suspended until the next month if the allowance
runs out. Games keep the service warm on their own — do this only if a cold start
bothers you more than the thin margin.

**Watching the heartbeat (optional).** Set the service's `LOG_LEVEL` to `debug` and
the server logs a `keepalive` line every time a player's client checks in from inside
a room; set it back to `info` afterwards.

**Verify it like a player.** Point the socket smoke test at the deployed URL:

```bash
BASE_URL=https://<service-name>.onrender.com npm run smoke -- --players 5 --days 5
curl -sS https://<service-name>.onrender.com/healthz     # {"ok":true,...}
```

Then open the site on a phone **on mobile data** (not wifi), create a room, and join
from a device on a different network. Draft a class, lock in, and let a war run. Reload
mid-game to confirm the rejoin works. The first request after a quiet spell takes
about half a minute (we measured 32 seconds after 18 idle minutes) — that is the free
tier waking up, not a broken deploy. If you configured the feedback form, post it
once and confirm the email lands in `FEEDBACK_TO`.

### Any Docker host or VM you already own

[docker-compose.yml](docker-compose.yml) and [Caddyfile](Caddyfile) are the recipe for
a machine you control: one app container, and Caddy in front of it for HTTPS and the
WebSocket upgrade. Copy `.env.example` to `.env`, set `CONTACT_EMAIL` and
`SITE_ADDRESS` (the public hostname, no scheme — an IP with `.sslip.io` appended works
with no domain at all), then:

```bash
docker compose up -d --build
docker compose logs -f            # look for "Grail Wars listening"
```

The app's port is deliberately not published on the host; everything arrives through
Caddy, which also requests and renews the certificate.

```bash
docker build -t grail-wars .
docker run -p 3000:3000 --env-file .env grail-wars
```

The image builds the client and serves everything from one process. Uploads live in
memory only; `.cache` is the one directory worth mounting if you want research to
survive a restart.

---

## How the Oracle works

1. **Lookup.** The character is searched on the **VS Battles Wiki**, then Wikipedia and Fandom. When a character is split across arc pages (common for long-running series) up to three versions are read and the strongest is kept.
2. **Parse.** The stat block (`Tier`, `Speed`, `Durability`, `Range`, `Intelligence`, `Powers and Abilities`, …) is flattened and parsed against the VS Battles scales. Peak feats win: `At least 5-B, likely 4-C` resolves to `4-C`.
3. **Score.** A 0–100 base score blends tier (38%), speed (20%), durability (18%), range (6%), intelligence (8%), and ability versatility (10%). Resistances count as defence, never as offence.
4. **Confidence.** `High` when a wiki page supplied tier, speed and durability; `Medium` when a page was found but a field was missing; `Low` for pure heuristics.
5. **Power Review.** The host sees every Servant ranked, with the sources behind each number, and can **edit tier, speed, durability, and abilities** or re-run research before starting the war. This is deliberate: parsing public wikis is imperfect, and the promise is a transparent, explainable result — not a mysterious one.

Curated corrections for famous characters live in [overrides.json](server/src/research/overrides.json) and always win.

---

## Repository layout

```
shared/src/         types, constants, socket event names (imported by both sides)
server/src/
  api/              /api/search, /api/image-proxy, /api/upload
  research/         the Oracle: providers, VS Battles parser, scales, heuristics
  sim/              scoring, world state, and the Director that writes the war
  rooms/            room state machine and the draw algorithm
  socket/           socket handlers (every payload validated with zod)
  data/             event templates, locations, counters, fallbacks
  scripts/          sim, oracle, and smoke CLIs
client/src/         React app: pages/, components/, store, socket wiring
render.yaml         the free Render blueprint — the published path
docker-compose.yml  optional self-hosted path: the app container plus Caddy
Caddyfile           HTTPS termination and the reverse proxy for that path
```

See [DECISIONS.md](DECISIONS.md) for the design choices behind the details.

---

## Tests

```bash
npm test          # unit tests: scales, parsing, the draw, the simulation, templates
npm run typecheck # strict TypeScript across both workspaces
npm run smoke     # full game over sockets against a running server
```

The simulation suite asserts the promises the game makes: a clearly stronger Servant never loses a lethal fight without a listed modifier, the war always ends with exactly one survivor, every living Servant appears each day, no dead Servant acts after dying, a Command Spell rescue happens at most once per Servant, and no rendered sentence ever leaves an unresolved `{placeholder}`.

---

## Attribution and legal notice

- Power-scaling data courtesy of the **[VS Battles Wiki](https://vsbattles.fandom.com/)** (CC BY-SA).
- Character data from **[AniList](https://anilist.co/)** and **Wikipedia**.
- This is a **non-commercial fan project**, not affiliated with or endorsed by Type-Moon or any rights holder of the characters used. Character names and images belong to their respective owners and are shown transiently through a caching proxy; the server never permanently stores third-party images.
- For takedown requests, contact the address in `CONTACT_EMAIL`.

Please do not add ads, payments, or paywalls to this project.
