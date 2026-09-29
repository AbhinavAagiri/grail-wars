# Grail Wars

A browser multiplayer party game inspired by the *Fate* Holy Grail War — a non-commercial fan project.

A host creates a room and shares a **4-letter code**. Up to 7 friends (14 in Extended War) each draft **one character from any fiction or history for each class in play** — the seven standard Servant classes, plus **Shielder, Ruler and Avenger** if the host switches them on. When the game starts, everyone is randomly assigned one class and one character from that pool, and the host picks a mode:

| Mode | What happens |
|---|---|
| **⚔️ Web-Driven War** | The server researches every summoned character on the web, power-scales them from their peak feats, and plays out a **5-day story-driven war** one event at a time — Hunger-Games-Simulator style, with portraits, a live roster, and a "Why?" panel explaining every result. |
| **🗣️ Debate Arena** | Everyone argues in chat over randomly drawn 1v1 matchups, votes in timed rounds, and winners advance until one champion remains. |

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

**`CONTACT_EMAIL`** is placed in the `User-Agent` when the server calls public wikis and APIs. Set it to your address if you deploy publicly.

**Feedback form (optional).** The home page's **Contact** tab posts to `POST /api/feedback`. Set `FEEDBACK_WEBHOOK_URL` to any endpoint that turns a JSON POST into an email (a free [Formspree](https://formspree.io) form or a Google Apps Script web app both work) and messages arrive at `FEEDBACK_TO` (default `aagiriabhinav2@gmail.com`). The address itself lives only in the server environment — it is never sent to the browser. With no webhook configured, submissions are logged and kept in memory so the form still gives the visitor a clean success state.

---

## Deploy to Oracle Cloud (Always Free)

The whole game is a **single Node process**: it serves the website, the API and the
websockets on one port. A deployment is therefore one small VM, one container, and
Caddy in front of it for HTTPS. [docker-compose.yml](docker-compose.yml) and
[Caddyfile](Caddyfile) are included and do all of that.

Rooms live in memory, so run **exactly one instance** — two would each hold half of
everybody's games.

**What you need:** an Oracle Cloud account (a card is required to verify identity;
nothing is charged while you stay inside Always Free), a GitHub repository holding
this code, and — for a nice URL — a domain. You can start without the domain and add
it later; that is a one-line change.

### 1. Get the code onto GitHub

```bash
cd path/to/grail-wars
git init -b main
git add .
git commit -m "Grail Wars"
gh auth login
gh repo create grail-wars --public --source=. --remote=origin --push
```

Without the `gh` CLI: create an empty repository on GitHub, then
`git remote add origin https://github.com/AbhinavAagiri/grail-wars.git && git push -u origin main`
— a personal access token works as the password.

### 2. Create the instance

Console → **Compute → Instances → Create instance**.

| Setting | Value |
|---|---|
| Image | Ubuntu 24.04 |
| Shape | Ampere → **`VM.Standard.A1.Flex`** |
| OCPUs / memory | 1 OCPU / 6 GB — the game uses a few hundred MB, well under the 2 OCPU / 12 GB the free tier allows |
| Networking | create a new VCN with a **public subnet** |
| Public IPv4 | assigned |
| SSH keys | "Generate a key pair", and keep the private key |
| Boot volume | the ~47 GB default |

Choose your **home region** carefully: it is permanent, and free Arm capacity exists
only there. Pick the one nearest you.

**"Out of host capacity"** is routine for Arm shapes. Try another Availability Domain,
try the smaller shape, or retry later. The always-available fallback is the AMD
`VM.Standard.E2.1.Micro` (1 GB RAM): the game runs on it, but building the client needs
more memory than that, so add a swap file first.

### 3. Open the firewall — in two places

**1. Oracle's side.** VCN → Security Lists → Default Security List → **Add Ingress
Rules**: source `0.0.0.0/0`, TCP port `80`, then the same for `443`. Port 22 is already
open for SSH.

**2. The machine's side.** Oracle Linux images silently reject everything but SSH
(Ubuntu's do not). Check first, and allow if needed:

```bash
sudo iptables -L INPUT -n --line-numbers
# If a `REJECT all` rule is blocking traffic, insert accepts above it:
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### 4. Install Docker

```bash
ssh -i <your-key> ubuntu@<instance-ip>
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER     # then disconnect and reconnect to apply
sudo apt install -y git
```

### 5. Configure and start

```bash
git clone https://github.com/AbhinavAagiri/grail-wars.git
cd grail-wars
cp .env.example .env
nano .env
docker compose up -d --build      # the first build takes a few minutes
docker compose logs -f            # look for "Grail Wars listening"
```

Set two values in `.env`:

- **`CONTACT_EMAIL`** — your address. It goes into the `User-Agent` sent to public
  wikis and APIs, so please do not leave the placeholder.
- **`SITE_ADDRESS`** — the site's public hostname, no scheme, as described next.

Everything else can stay blank: with no keys at all the game is fully playable.

### 6. Give it a name and a certificate

**With a domain:** at your registrar, add an **A record** for `grail.example.com`
pointing at the instance's IP, and put that hostname in `SITE_ADDRESS`.

**Without one yet:** use the free `sslip.io` trick — the hostname is the instance's IP
with `.sslip.io` appended, such as `130.61.12.34.sslip.io`, and it resolves back to
that address on its own, so Caddy can still issue a real certificate.

Either way Caddy requests and renews the certificate itself. Moving to your domain
later is `nano .env` followed by `docker compose up -d`.

Reserve the instance's public IP (Networking → **Reserved public IPs**) so a restart
can never hand you a different address and break DNS.

### 7. Verify it like a player

```bash
curl -sS https://<your-hostname>/healthz     # {"ok":true,...}
```

Then actually play it: open the site on your phone **on mobile data** (not wifi), create
a room, and join from a laptop on a different network. Draft every class, lock in,
summon, and let a war run. Reload mid-game to confirm the rejoin works.

If `/healthz` never answers, it is almost always step 3 — one of the two firewalls — or
DNS that has not propagated yet.

### 8. Living with it

| Task | Command |
|---|---|
| Update to the latest code | `git pull && docker compose up -d --build` |
| Watch the server | `docker compose logs app --tail 200` |
| Resource use | `docker stats`, `df -h` |

The stack comes back on its own after a VM reboot, and the research cache persists on a
volume so restarts do not re-query every wiki.

Two things to know about the free tier. Oracle may **reclaim** an instance that stays
idle — the policy looks at CPU, network and memory all sitting under about 20% across a
week — so a long quiet spell is not guaranteed to survive it; set a billing budget
alert so nothing can surprise you. And a restart or redeploy ends any game in progress,
because rooms live in memory.

### Docker elsewhere

```bash
docker build -t grail-wars .
docker run -p 3000:3000 --env-file .env grail-wars
```

The image builds the client and serves everything from one process. Uploads live in
memory only; `.cache` is the one directory worth mounting if you want research to
survive a restart.

### Render (alternative)

A blueprint is included in [render.yaml](render.yaml): push to GitHub, then **New →
Blueprint** in Render and pick the repository.

| Setting | Value |
|---|---|
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check path | `/healthz` |

Render supplies `PORT`; the server reads it and falls back to `3000`. Note that a free
Render service **sleeps after 15 minutes** without traffic and holds nothing in memory,
so games in progress do not survive a sleep — which is why the VM above is the
recommended host.

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
docker-compose.yml  single-host deployment: the app container plus Caddy
Caddyfile           HTTPS termination and the reverse proxy to the app
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
