# Design decisions

Choices made while building Grail Wars, including places where
the implementation deliberately deviates from the original specification, and
the bugs that end-to-end verification uncovered.

---

## 1. Placeholders: the "loser" is `{X}`, not `{L}`

**Problem.** The spec used `{L}` for the current location and also described a
"loser" placeholder. They collided, and roughly 40 templates (including every
outcome template) were ambiguous.

**Decision.** `{L}` is **location**, always. The loser of a resolved fight is
`{X}`; the winner is `{W}`. The allowed placeholder set is fixed and validated
in tests:

```
A B C MA MB MC MW ML cA cB cC L NP_A NP_B NP_C NP_W NP_X NP_L W X n day
```

## 2. Template text is gender-neutral

The reference simulator says "…to not kill him". Genders are unknown at template
authoring time, so every template is written gender-neutral and `{A.obj}`
resolves to "them". No template branches on gender.

## 3. Wars of 3/7 days are normalised onto a 5-act structure

The templates were authored for a five-act arc. Rather than duplicate them per
war length, `actDayOf(day, totalDays)` maps any day onto an act: day 1 → act 1,
last day → act 5, second-to-last → act 4, and the days between alternate acts
2/3. Templates declare which acts they belong to and are filtered on the
resolved act, so a 3-day and a 7-day war both tell a complete story.

## 4. The final day is guaranteed to produce exactly one winner

Day 1 fights are non-lethal, and the Director paces deaths against a per-day
target derived from `curve(d/D) = (d/D)^1.6`. On the final day, duels are
resolved with `DuelContext.decisive = true`, which disables mercy, Command
Spell rescue, and mutual destruction — so each removal takes out exactly one
Servant. Loops that add or remove extra fights are capped (`guard < 40`) and
break out when a pass changes nothing, so the finale always terminates with one
survivor. Asserted for N ∈ {2,…,7,10,14} and D ∈ {3,5,7}.

## 5. `@types/express` is pinned through root `overrides`

`@types/multer` pulled in Express **5** typings while the server depended on
Express **4** typings directly. Two copies of `Request`/`Response` in the
program made them structurally incompatible. Fixed with root-level overrides
pinning `@types/express@^4.17.21` and `@types/express-serve-static-core@^4.19.9`,
which required a clean `node_modules` reinstall.

## 6. `PORT` parsing uses `.catch(3000)`, not `.default(3000)`

Some shells export an empty or literal `PORT=0`, which fails `.positive()`
validation and prevented the server from booting at all. `z.coerce.number()
.int().positive().catch(3000)`, plus treating empty environment strings as
unset, makes a missing or nonsense `PORT` fall back to 3000 instead of crashing.

## 7. `sharp` is optional and not installed

`sharp` is a native dependency that complicates free-tier deploys. Uploads are
therefore handled in two ways: the client centre-crops and resizes to a 512×512
JPEG on a canvas before sending, and the server sniffs **magic bytes** (not just
the MIME header) and streams the bytes back unchanged. If `sharp` happens to be
present it is loaded through a dynamic import and used to normalise images.
`/api/image-proxy` enforces content type, a size cap, an SSRF blocklist, and a
redirect limit on its own.

## 8. All state is in memory, and nothing is persisted

Rooms, picks, uploads, and media live in process memory with TTLs. Uploads are
never written to disk. Rooms idle longer than 4 hours are swept every 5 minutes.
This keeps the free-tier deploy trivial, at the cost of losing games on restart
— acceptable for a party game and required by the spec's no-database rule.

## 9. The research cache is on disk; the client build is not

Profiles cache for a week in `server/.cache/research.json` (gitignored) so
re-matching the same character is instant. Because the cache is long-lived, any
change to the parser can be masked by stale entries — so `npm run oracle`
clears the profile cache by default. Pass `--cached` to skip that.

---

## Bugs found and fixed during verification

The client had never been typechecked, and the game had never been run
end-to-end. Running it surfaced these; all are fixed and covered where practical.

### A. Nobody could create or join a room (`room:create`, `room:join`)

The socket-handler wrapper defaults to *requiring* a room, and only
`room:reconnect` opted out. Both `room:create` and `room:join` therefore failed
their own guard with "You are not in a room." — the game was unplayable from the
first screen. Fixed by passing `{ needsRoom: false }` for the two entry points
(and for `room:leave`, which is also legal while room-less). This is exactly the
class of bug a typecheck cannot catch, and it is why `npm run smoke` exists.

### B. The client build resolved `client/dist` from the working directory

The static-hosting path used `path.resolve(process.cwd(), '../client/dist')`, so
the built client was only served when the process happened to start inside
`server/`. Now resolved relative to the module's own URL, which works from any
working directory in both dev and production layouts. SPA deep links
(`/room/ABCD`) were verified to fall through to `index.html`.

### C. `SettingsPatch` existed in two incompatible shapes

The client typed settings updates as `Partial<RoomSettings>` (a *shallow*
partial) while the server required a *deep* partial for the nested `war` and
`debate` blocks. Moved `SettingsPatch` into `shared/` so both sides use one
definition.

### D. Resistances inflated the offensive hax score

`extractAbilities` scanned for offensive abilities first, so "Resistance to
Existence Erasure" granted the full 22-point *offensive* weight — a character
who merely survives existence erasure scored as if they could erase others.
Resistance phrases are now pulled out and neutralised **before** the ability
scan, and are scored separately (3 each, capped at 15). Ichigo's and Saitama's
hax scores dropped to defensible values.

### E. The character's "Noble Phantasm" was a wiki bookkeeping field

`keyAbilityName` preferred the wiki's `Key:` field, which lists **forms and story
arcs**, not attacks. The finale narrative was literally rendering "unleashes
`Pre-Training`" and "`Beginning of Timeskip`". Real technique names are now
preferred (`Kamehameha`, `Gum-Gum Jet Pistol`, `Flash Step`), and prose
fragments like "allowing for high-speed movement" are rejected in favour of an
ability name.

### F. Raw HTML leaked into displayed text

The stat-block flattener kept `<gallery>`/`<figure>`/`<img>` content, so a
technique name could come out as `Gallery[] <img style="" src="https://…`.
Those elements are now removed before flattening, markup and attribute
leftovers are scrubbed per line, and lines without real words are dropped.

### G. VS Battles arc splitting sent tiers far too low

Long-running characters are split across arc pages. Searching `Naruto Uzumaki`
returned `(Part I)` first, so Naruto was scaled off a mid-arc page at **High
7-A**. The engine now reads up to three pages for the same character and keeps
the **highest** tier, which is what "peak feats as depicted in their media"
requires — Naruto resolves to **4-B**.

### H. Wrong-continuity pages were selected

`Sherlock Holmes` matched the **Fate** Servant page, giving a literary detective
`High 6-C` with Reality Warping and a Noble Phantasm. Two causes, both fixed:
the source was appended to the search even when it was just the name again
("Sherlock Holmes Sherlock Holmes"), diluting the ranking; and pages were grouped
as "the same character" purely by stripped title, so `(Fate)` and `(BBC)` were
treated as later versions of the literary character. Continuity qualifiers now
carry a penalty unless the caller asked for them, and only **era/version**
qualifiers (`(Part II: War Arc)`, `(New Era)`) group together. Sherlock Holmes
now resolves to the correct page at `9-C`.

### I. `war:event` payload shape

While writing the smoke test, the war event appeared to arrive empty. The server
sends `{ event }`; the client store already unwrapped it correctly, so this was
a bug in the new test script only — noted here because it is an easy trap when
adding new socket listeners.

---

## 10. Search offers people, not concepts

The public search APIs are happy to return the tool, the abstract noun and the
car. Rather than trust them, every candidate passes through
`server/src/api/characterFilter.ts` before it reaches the client:

- **AniList and TMDB are trusted** — they only index characters and people.
- **Titles that name a work or product are dropped outright** (`(Verse)`,
  `(software)`, `… Ultimate Ninja Series`).
- **Pages that describe a work are dropped outright** ("X is a 2017 American
  action thriller film" — the adjective-tolerant pattern matters here, because
  "American Assassin" otherwise reads as a character name).
- **Wikipedia and Fandom are strict**: keep people, characters and multi-word
  proper nouns; drop anything matching a negative signal (places, works,
  products, abstract nouns) or a bare single-word page with no character
  language — which is what removes "Assassination" and "Saber (tool)".
- **VS Battles is lenient** (it is a character wiki) but still loses non-character
  titles and work descriptions.

Ranking then favours an exact stripped-name match, so `kirito` puts the real
Kirito first instead of four unrelated AniList characters that share the name.
The literal "use exactly what I typed" row is untouched: filtering can only ever
remove suggestions, never block a player from committing to a name.

Known residual: a handful of VS Battles pages that are *works* (e.g. the film
"American Assassin") carry no description in the search API, so there is no text
to classify. They are ranked below the real characters but not removed.

## 11. Narration styles are a voice layer, not a second engine

`Hunger Games` and `Fate` do not fork the simulation. `sim/narration.ts`
provides style-specific writing for the four places where authorial voice
actually changes the story: the prologue, the death notices, the nightfall
recap and the winning wish. Everything else keeps using the existing template
corpus, so balance, pacing and the "exactly one winner" guarantee are untouched
and the templated/AI paths stay byte-identical to before.

The lobby's narration dropdown offers Templated, Hunger Games and Fate. The
"AI Enhanced" option was removed on request; `narration: 'ai'` is still accepted
by the schema and still honoured by the server for rooms that already carry it,
so the removal is purely about what the player can choose. `locationMode: 'ai'`
("Let AI Decide") is a different setting and is untouched.

## 12. The war location is resolved in the lobby, not mid-game


The location is part of `RoomSettings` (`war.locationMode`) plus two room-level
fields: `warLocation` (once known) and `locationChoice` (pending chooser and
three options). Resolving it in the lobby means there is no new phase, no new
screen and no dead end — and `resolveLocation()` still guarantees a location
exists before `runSimulation` runs, so a chooser who never answers cannot stall
the war.

## 13. Feedback uses a webhook, not SMTP

Sending mail directly would mean an SMTP dependency plus credentials the project
does not have, so `POST /api/feedback` posts JSON to `FEEDBACK_WEBHOOK_URL`
(Formspree, Google Apps Script, Zapier — all with free tiers) and falls back to
an in-memory inbox plus a log line. `FEEDBACK_TO` lives only in the server
environment; the browser never learns the address. It defaults to the
placeholder `you@example.com`: the repo ships no real inbox, and a deployment
supplies it through its environment (`render.yaml` prompts for it). `CONTACT_EMAIL`
is a different role on purpose — the public address carried in the `User-Agent`
when the server calls public wikis, and the one the README names for takedowns —
while `FEEDBACK_TO` is a private, dedicated inbox. Verified end-to-end: in a real
browser the form posts, the server records it, and the visitor sees the clean
success state; against a local mock webhook the delivery path posted the exact
JSON payload (`to`, `subject`, `replyTo`, `message`, topic in the subject) and
logged `feedback delivered`.

## 14. Credits page bundles the real logos, not monograms

The credits page ships each source's actual logo as a small local asset under
`client/public/brands` (Type-Moon from Wikimedia Commons, VS Battles from its
Fandom wiki, the rest from the CC0 Simple Icons set). Nothing is hot-linked, so
there are no third-party requests and no 404s, and each mark sits on a pale tile
because most logo files are drawn for a white page. If a file ever fails to load
the tile falls back to the brand's initials. The logos are used nominatively for
attribution, and the legal paragraph says so plainly.

## 15. Anime and manga characters are pictured with anime/manga artwork

Anime and manga characters were being pictured with whatever Wikipedia had for
their name, which for these characters is regularly a logo, a cover or a scan.
`buildImageCandidates` now asks AniList first, under both the full name and the
name with any wiki disambiguator stripped (AniList finds nothing for "Son Goku
(Dragon Ball)" but returns him for "Son Goku"), and only accepts an entry when
the name genuinely matches — same name, or the same name reordered or
re-romanised ("Son Goku" / "Gokuu Son"). A match means the character is an
anime/manga character, and those are pictured from AniList, their franchise's
wiki and the VS Battles page only: no Wikipedia, no TMDB.

Similarity scoring is deliberately not used for this test. Jaro-Winkler rates
"Son Goku" against "Son Goten" at 0.88 and "Kirito" against "Kirito Kamui" at
exactly 0.90 — loose enough to hand a Servant somebody else's face.

Real-world figures are exempt: a pick labelled `History`, `Greek mythology` or
`Arthurian legend` keeps the encyclopaedic lead image even though an anime
adaptation of the same name exists on AniList. A plain `Wikipedia` pick is not
exempt, because that label is data provenance rather than a statement about the
character — Naruto picked from Wikipedia is still an anime character.

## 16. A generated avatar is never allowed to shadow real artwork

Every VS Battles and Wikipedia search result starts with a generated initials
avatar as its thumbnail, and that placeholder used to be treated as a real
picture by the image waterfall: it was pushed first and became the Servant's
face even after real artwork had been found. `isPlaceholderImage` now separates
"a picture someone chose" (an upload under `/media`, a chosen candidate) from
"our generated placeholder", so a placeholder is only ever the last resort.
`Room.fillCandidates` additionally upgrades a slot whose only image is a
placeholder, and patches the Servant and assignment copies already in play, so a
slow lookup cannot leave the war showing initials. Autofilled and custom
Servants now run through the same waterfall instead of being stuck on initials.

## 17. AniList is matched on aliases and on the series' title

AniList files characters under their in-universe legal name and keeps the name
everyone actually uses in `alternative`: searching "Kirito" returns **Kazuto
Kirigaya**, with "Kirito (キリト)" as an alias. Because the waterfall only
compared `name.full`, Kirito never matched — so he was not recognised as an
anime character, and his portrait fell through to whatever the wiki had. The
search query now requests `name { full native userPreferred alternative }`, the
provider exposes those as `aliases`, and `bestAniListMatch` accepts a match on
any of them (the reordered/re-romanised rule is still applied, so "Kirito" still
does not match "Kirito Kamui").

Two related fixes came with it:

- **Alias-first results.** A search for "Kirito" used to surface "Kazuto
  Kirigaya" ninth, behind three VS Battles pages. `displayName` shows the alias
  the player actually typed when it is not part of the official name, and
  `characterScore` ranks a candidate whose alias matches the query. "Kirito —
  Sword Art Online", with AniList artwork, is now the first row.
- **Characters named after their series.** AniList holds Lupin III as "Arsène
  Lupin III" in "Lupin III", so no name rule could ever reach him. When an entry
  appears in a work whose title is exactly the name or source we searched for,
  and every word of that name appears among the entry's own names, it is the same
  character under a fuller title.

AniList also answers with a grey silhouette at `…/character/large/default.jpg`
for characters it has no artwork for. That URL is now treated as a placeholder
by `isPlaceholderImage` (our images are proxied, so the check decodes the URL
first) and the provider returns an empty thumbnail instead, which lets the
waterfall continue to a real picture.

## 18. Bursts of lookups must not cost a portrait

Three things kept blank portraits alive under load:

- `politePostJson` did not retry. `politeFetch` retried on 429/5xx but the POST
  path — AniList — did not, so a single throttled answer meant no anime artwork.
  It now retries up to three times, waiting 2.5s after a 429.
- Every host was paced at 2 requests/second. AniList allows 90 a minute, so it
  gets its own 900ms interval; a room full of anime characters used to throttle
  itself into initials.
- AniList searches are cached per query (10 minutes, the existing search cache),
  and the waterfall's AniList branch gets a longer budget than the other
  providers, because its requests are paced and a busy room can see them queue.

The draft list was also full of initials for a duller reason: VS Battles search
results carry no thumbnail at all. One batched `pageimages` call now illustrates
all five rows (400px thumbnails only — a VS Battles "original" is often a
multi-megabyte scan).

## 19. The attribution footer lives in the app shell

`SiteFooter` was rendered by seven pages, so screens that did not ask for it —
the war, the arena, the research progress view — had no attribution at all. It
now renders once in `App`, outside the router, and the per-page copies are gone.
Every route, including the room screens, gets exactly one footer.

## 20. Picture coverage is a number, not an impression

`npm run images` walks the offline fallback roster — the 200 characters a room
summons when nobody picks — through the real image waterfall and reports which
ones could only produce an initials avatar. It exits non-zero when anything is
bare, so it can gate a release the way the smoke test does. It found 9 gaps,
which produced three fixes: the Fandom wiki map gained Middle-earth and
Inheritance Cycle entries, and three roster sources were corrected (Margaretha
and "Cuchulainn Berserk" are Fate/Grand Order, so the Type-Moon wiki can resolve
them, and "Gojo Kagami — Fiction", which is not a character anywhere, was
replaced with a real caster).

## 21. The project runs on the Node 24 LTS line

Node 20 reached end-of-life on 30 April 2026, which left the project on a line
that no longer receives security patches. It now targets **Node 24.21.0**
(Active LTS):

- The development toolchain at `.tools/node` was replaced with the official
  Windows build, verified against the published `SHASUMS256.txt` before being
  unpacked. The old v20 directory is kept at `.tools/node20` so the swap can be
  undone with a single move; `.tools/` is gitignored, so no repository file
  changed for it.
- `Dockerfile` builds and runs on `node:24-alpine`.
- `render.yaml` pins `NODE_VERSION: 24.21.0`. Render otherwise uses its own
  default, which is how a free service silently drifts onto an unsupported line.
- `engines.node` moved from `>=20` to `>=22`. It is a floor, not a pin: the
  project is developed and deployed on 24, and 20 is no longer supported by
  anyone.

No code change was needed. Every dependency already accepted Node 24 — vite
5.4.21 and vitest 2.1.9 declare `^18 || >=20`, tsx 4.23.15 and rollup 4.63.5
`>=18`, lru-cache 11.5.3 `20 || >=22` — and the source uses none of the APIs that
20→24 removes or deprecates (`url.parse`, `new Buffer`, `punycode`, recursive
`fs.rmdir`, `process.binding`, `createRequire`). Nothing native is installed
(`sharp` is optional), so no rebuild was required, and the rebuilt client bundle
is byte-identical to the Node 20 output.

## 22. The early-access gate, the version stamp, and the Debate Arena hold

**The notice.** `EarlyAccessNotice` renders once per page load, from `App` beside
the footer, so it appears on every route and not only the landing page — someone
arriving through a shared room link is told what they are looking at. It is at
`z-60`, above the nav (`z-40`) and the toasts (`z-50`). Both the backdrop and the
card dismiss it: the card deliberately does *not* call `stopPropagation`, because
the brief promises "click anywhere to close" and a player who clicks the text is
clicking anywhere. Any key dismisses it too.

Once dismissed it is remembered under `hgd:early-access-ack` in
**`sessionStorage`**, which is the scope that matches the intent: it survives a
reload, so refreshing mid-draft or mid-war is not interrupted, but it is scoped
to the tab — a new tab, or a returning visitor in a new session, sees the notice
again. Closing it is the only thing that writes the flag (a click, a key, or
Escape all go through the same `close`). When storage is unavailable — private
windows, blocked cookies — both the read and the write fail quietly and the
notice simply shows on every load, which is the safe direction to fall back in.

**The version stamp.** `Early Access V.0.5` is fixed to the bottom-right of the
landing page only, at 10px, with `pointer-events: none` so a corner badge can
never swallow a click. The version is part of the shipped feature set, not the
`package.json` version, so it is bumped by hand in two places — this stamp and
the early-access notice's badge — and the two must be changed together.

**The Debate Arena hold.** The mode stays in the type union, in
`DEFAULT_SETTINGS`, in the server and in the bracket engine — only the lobby card
is disabled, with a `Coming soon` badge, a `Not playable yet` line, dimming and a
`not-allowed` cursor, and the landing-page card is dimmed with the same note.
The gate is deliberately UI-only: the server still accepts
`mode: 'DEBATE'`, so `npm run smoke -- --mode DEBATE` and any future work can
drive the mode directly, and a room that already came back in that mode still
runs. Rooms are created in War by default (`DEFAULT_SETTINGS.mode`), and a
disabled button cannot fire `onClick`, so there is no path to select it by
accident.

## 23. The project is called Grail Wars

The product was named *Holy Grail War Drafter*, which names the inspiration
rather than the game. It is now **Grail Wars**, and every place the product names
itself changed with it: the page title and meta description, the home-page
heading (still two lines — `GRAIL` / `WARS`), the nav mark (`GW`, was `HGD`), the
nav's product label, the Credits intro, the OpenRouter referer, the server's
startup logs and its "server is running" line, the feedback email subject and
`site` field, the User-Agent we send to public wikis (`GrailWars/1.0`), the
package name and description, the Docker and Render names, and the README and
`.env.example` headers.

Deliberately **not** renamed: the `@hgd/shared` workspace scope (39 files import
it), the `hgd-*` CSS classes (222 usages) and the `hgd:*` storage keys. They are
internal identifiers, invisible to players, and renaming them would be a wide,
risky diff for no user-visible gain. The *Holy Grail War* stays wherever it means
the fictional event or the source material rather than the product — the Credits
attribution to Type-Moon, the war-mode descriptions, the narration templates and
the README's "inspired by the *Fate* Holy Grail War" — because that is the thing
being described, not the name of this site.

An unrelated defect surfaced while editing `.env.example` (which only the shell
could read, not the patch tool): the file began with a stray `[TEMPLATE]` line.
It was removed; every documented key and comment was preserved.

`package-lock.json` still records the old root name in its two metadata fields.
The patch tool refuses to edit the file and rewriting a 20,000-line generated
file by hand is not worth the risk; npm neither reports nor fails on it
(`npm ci --dry-run` exits 0), and the next `npm install` refreshes it.

---

## 24. Free hosting is one Render service; the VM stack is the optional path

Three properties of the game rule out most free hosts: room state, the war timeline
and the arena bracket all live in a `Map` inside a single Node process; the war
advances on server-side timers; and every player holds a long-lived Socket.IO
connection. Serverless platforms run functions, not a server, so Vercel-shaped hosts
would need the state moved to an external store and the timers rebuilt around
client-driven ticks before they could hold one game.

What is left after the 2026 free-tier shake-up (verified 30 September 2026) is
**Render's free web service**, and that is the documented path:

- **No payment method.** Koyeb needs a card plus a $29 pre-authorisation hold,
  Northflank needs a card for every plan, Fly.io ended free allowances in October
  2024, Railway's free grant is $1 of credit a month, Heroku / Glitch / Cyclic are
  gone, Hugging Face made Docker Spaces a paid feature, and SnapDeploy's free tier
  excludes WebSockets. The previous plan's target, Oracle's Always Free tier, halved
  its Arm allowance in June 2026 and is no longer available to this project.
- **The free instance is the shape the game needs.** One instance, 512 MB, 0.1 CPU,
  750 instance-hours a month and 5 GB of outbound bandwidth, with TLS and WebSockets
  on the same origin — which is what the client's bare `io()` call, the relative
  `/api` fetches, the production CSP (`connect-src 'self' ws: wss:`) and the disabled
  production CORS all already assume. [render.yaml](render.yaml) pins `NODE_VERSION`,
  so the runtime cannot drift onto a line that no longer exists.
- **`trust proxy` stays at exactly 1, matching one platform hop.** Render appends the
  real client address to `X-Forwarded-For` and the server trusts exactly one hop, so
  per-IP rate limiting sees players rather than the proxy. The same value is correct
  behind Caddy, which is why the VM path below needs no second setting.

The one real cost is that a free instance **sleeps after 15 minutes without inbound
traffic**, waking in about half a minute (32 s measured), and a sleep wipes the
in-memory rooms. Render counts "HTTP requests and WebSocket messages from existing
connections" as traffic,
so the fix is a **keepalive**: `App.tsx` emits `C2S.keepalive` every four minutes
while a room is on screen, and the server answers with a `debug` log and nothing else.
The timer is deliberately one stable interval that reads the room at fire time —
re-subscribing on the room object would reset it on every patch, and patches arrive
far too often for it to ever fire. The payload message is the one part of the traffic
the app actually controls: because the socket is app-wide, any open tab already
produces engine-level heartbeats, and Render's edge may or may not count those. With
no tab open at all the service still sleeps, and stops spending hours. That is exactly
what the first report from the published site looked like: nothing was open, so nothing
sent a heartbeat, the service slept about fifteen minutes after the deploy's own checks
stopped, and the next visit woke it in about 32 seconds. A room left open through a quiet
window kept it awake instead, which the results table records. The README also
documents an optional free uptime pinger for anyone who would rather never see a cold
start, with its cost stated: an always-warm service spends about 744 of the 750
monthly instance hours.

[docker-compose.yml](docker-compose.yml) and [Caddyfile](Caddyfile) stay in the
repository as the path for a machine someone already owns. They keep that deployment
deliberately small: one container runs the game with its port unpublished, Caddy
publishes 80/443 in front of it and terminates TLS, `NODE_ENV=production` is forced in
the compose service because `.env.example` is a development template whose value would
otherwise switch off the production posture, `SITE_ADDRESS` is the only
deployment-specific value (a free `sslip.io` name works before a domain exists), and
the certificate lives on a named volume so restarts do not re-request it from Let's
Encrypt. None of it is used by the free path — Render terminates TLS itself — and none
of it is required to publish the game.

Two supporting fixes came out of the earlier VM work and still matter. `tsx` moved
from `devDependencies` to `dependencies`, because it loads the production start
command — a production-only install previously started a server with no way to execute
it. And the Render blueprint's build command became
`npm ci --include=dev && npm run build`, since `NODE_ENV=production` applies to the
build as well and a production-only install has no `vite` with which to build the
client.

Limits, stated plainly: there is no database, so a sleep, restart or redeploy ends
every game in progress; Render labels the free workspace "not for production", which
is the right label for a fan party game; and 5 GB of monthly outbound bandwidth, with
the portrait proxy as the main consumer, is ample for many game nights but is a cap,
not an allowance.

## 25. The landing screen is exactly one screen

The home page has one job: start a game. Everything it needs to do that — the menu
bar, the name field, the play buttons, the two mode cards and the attribution — fits
on one screen, so it does, and the page never scrolls. A landing page that scrolls to
reach its own footer reads as unfinished, and on a laptop it puts the play controls
below the fold for no reason. Interior screens (lobby, draft, war, arena, credits,
contact) are documents and keep scrolling normally.

Three pieces make that work in [client/src/App.tsx](client/src/App.tsx):

- **The footer is a sibling of the routes inside a viewport-height flex column**, so
  it is part of the screen rather than something below it. The landing route gets a
  fixed `h-dvh` (with `overflow-hidden`); every other route keeps `min-h-dvh` and
  grows past the viewport as before. The fixed height matters: with a *minimum* only,
  flex items never shrink, so a slightly-too-tall landing page would push the shell
  past the viewport instead of fitting into it.
- **The middle column is the only thing that can shrink** (`min-h-0 flex-1`) and it
  scrolls internally as a last resort — on a very small window the play controls stay
  reachable rather than being clipped by that `overflow-hidden`. Its content is
  centred with auto margins rather than `justify-content: center`, which in an
  overflowing container would push the top of the hero out of reach; auto margins
  collapse to zero when there is no free space, so the whole column stays scrollable.
- **The landing gets a compact footer** (`<SiteFooter compact />`) and a heading sized
  with `clamp()` against viewport height, so the screen adapts to short windows
  instead of overflowing them.

On the narrowest phones (320×568) the join form is still taller than the space left
between the nav and the footer; it scrolls inside that column, with the menu bar and
attribution staying put, which is the intended graceful degradation rather than a bug.

## 26. Anime evidence flows AniList → Fandom → Wikipedia, and VS Battles decides the scale

Drafting "Saber" — the *Fate/stay night* Servant — returned **10-C**, the tier of a
kitchen knife, because of how the old lookup ranked its sources. It searched the VS
Battles wiki by title, rejected *Artoria Pendragon (Saber)* as a name mismatch (the
parenthetical read as a different work), fell through to Wikipedia and summarised the
generic article **Saber** — the sword — then scaled the sword's prose. Two changes fix
that class of bug:

- **A fixed source waterfall for anime.** AniList first (structured character data),
  then Fandom (in-universe detail), then Wikipedia as a genuine last resort. Sources
  after the first sufficient one are not consulted, so a generic Wikipedia article can
  no longer shadow a specific VS Battles page. Sufficiency is `≥220` characters of
  evidence *and* either `≥700` characters or an explicit feat signal, so thin AniList
  blurbs still fall through to Fandom.
- **A real VS Battles resolver** (`server/src/research/vsbLookup.ts`): it trusts
  provider ids over titles, resolves aliases, scores candidates on name and qualifier
  overlap (handling version qualifiers like *EoS*, *Timeskip*, *Awakened*), and merges
  peak forms according to the peak-tier policy rather than picking whatever page the
  search API happened to return first. VS Battles is the scaling authority for both
  rosters; AniList/Fandom/Wikipedia supply the prose and the abilities.

Hand-written overrides (`server/src/research/overrides.json`) still win over every
provider, and `saber`/`artoria pendragon` are pinned there. The result: **Saber → Low
6-B, FTL, high confidence** off *Artoria Pendragon (Saber)*; EMIYA and Cú Chulainn
Low 6-B, Roronoa Zoro Low 5-B, and Goku 2-C under the peak policy.

## 27. Class gating is strict: unverified characters are refused

Each class carries a `qualifies` predicate and a curated trait table
(`server/src/research/classAffinity.ts`). A pick is admitted only when the assembled
evidence supports the class; otherwise it is refused with a plain-language reason —
drafting **Artoria Pendragon as an Archer** answers: *"Artoria Pendragon can only be
drafted as Saber or Caster or Ruler — their fighting style doesn't fit this class."*
Weak evidence counts for the class it fits (a Saber profile makes a poor Archer
rather than a free pick); an unresearched character is blocked instead of waved
through. Room pools add a first check of their own: a character outside the room's
roster is refused with *"That character is not on this room's Archer roster."*

## 28. AI Chooses deals 25 characters per class from committed rosters

The Lobby's **Rules of the War** gained a toggle (off by default) and a dependent
select — *Anime only*, *History only*, *Mixed* — disabled until the toggle is on.
When it is, the server deals 25 characters for every enabled class from
`server/src/data/roster-anime.json` and `roster-history.json`, sampled from the top 80
of each class list so drafts stay recognisable, and shared by the whole room. The pool
is exposed only during the draft, and every pick is checked against it. Free manual
drafting is untouched when the toggle is off.

The rosters are generated by `npx tsx src/scripts/buildRosters.ts` from public wiki
data — VS Battles' drawn-media categories intersected with its class categories for
anime; Wikipedia category trees for history — and then verified against Wikidata
before being committed. The verification is what keeps the lists shippable:

- Entries must be people or legendary figures (instance-of labels): places, groups,
  monuments, works, motifs, idioms, artistic episodes and pseudo-authors are rejected.
- **Category-derived humans must have died before the modern era.** Wikipedia's trees
  otherwise reach today's news cycle — living athletes, current heads of state,
  freshly sentenced criminals. Legends, gods and monsters have no dates and are exempt.
- Collective and plural names (*Sons of Odin*, *Castor and Pollux*) are dropped, as are
  the notorious names the trees are known to leak.
- The hand-picked core the game already shipped is added on top, which is where modern
  figures like Simo Häyhä stay.

Final roster sizes: history **250 per class** except assassin (77; the pre-modern ninja
and spy trees are small), anime 250 except lancer (156), shielder (85), rider (85) and
ruler (119). Pools top up from the other bucket and then the fallback list, so a class
never comes up short of its 25.

## 29. The version stamp, the draft's honesty note, and the road that is the Roadmap

**The stamp moves to v0.5.** The shipped early-access stamp reads
`Early Access V.0.5` in both places it appears — the fixed bottom-right badge on
the landing page and the badge on the first-load notice — because the feature set
behind it (the scaling waterfall, class gating, AI Chooses) is what the number is
counting. The version is a hand-maintained string, not read from `package.json`,
so the two copies are the whole source of truth and are changed together.

**The draft says why it is slow.** Under *"The host can begin once every Master
has locked in"* the draft bar now carries a second, italic line: *"I apologize for
any delay when selecting characters, I am still trying to optimize the drafter."*
It lives inside the same `!allLocked` block as the hint it sits under, because
both vanish once the draft is over and the summoning button takes the space. The
pair is centred under the *Lock In* / *Begin Summoning* buttons with a
`max-w-md` measure and `text-wrap: pretty`, so the draft bar reads as one column
rather than a left-hugging paragraph under a centred button. The
note is a deliberate choice over silence: a pick that pauses while the Oracle
checks it against the class otherwise reads as a hung UI, and a one-line apology
is cheaper than a spinner on every card.

**The Roadmap is a road.** A fifth nav item, *Roadmap*, sits between *Credits*
and *Contact* on every public page (`SiteNav`) and points at `/roadmap`. The page
is drawn rather than listed: the road enters from the left edge of the screen,
bulges right to **v0.5**, bends back left to **v1.0**, and runs out of the bottom
into an arrowhead under a *Coming soon* sign — with a card pinned to a gold coin at
each stop and a *We are here right now* marker over the stretch the project has
actually reached.

The road is **driven, not waypointed**. It is a sequence of straight *runs* joined by
circular *bends* that all share one radius (`r: 11`), and each bend is
tangent-continuous with the heading the last one left: a run's direction *is* that
heading, and a bend is an arc of that fixed radius, so a corner is not merely avoided
but impossible to express. That is the answer to the complaint that the first drafts
were "harsh drawings" — the version before this one fitted a Catmull-Rom→cubic-Bézier
curve through hand-placed waypoints, and a spline through unevenly spaced points
produces exactly the tight, uneven kinks that read as a drawing mistake. One uniform
radius makes every turn curve the same way, wherever its neighbours sit.

The path lives in a **150 × 100 grid that matches the 3:2 box it fills**, so the SVG
needs no stretching (no `preserveAspectRatio="none"`) and every stroke can be given in
the same units — the whole diagram scales as one piece. One grid unit is 1.5% of the
width, so a mark's grid `x` is `x / 1.5` percent and its `y` is already a percent.

It is painted back to front as **eight strokes of that one path**, all in grid units:
a gold haze (9.6), a contact shadow (8.2, pushed down past the slab), the slab's side
face in two tones (`KERB_W`, the deeper at `EXTRUDE = 1.7` and the lit edge at half
that), the gold kerb (5.8), the tarmac (4.8), a lighter centre band (2.4) and a dashed
centre line (0.34). The side face is the same path translated down, which is what turns
a flat ribbon into a slab with a thickness you can see. The solid strokes are
**butt-capped**, so the road and the slab under it both end in a clean cut at `ROAD.end`
for the arrowhead's wide base to sit on — a round cap would bulge past the arrow. The
dashes keep round caps, because a pill is what a road marking should be.

The marks are **named points *on* that drive**, not coordinates of their own: `v0.1`
sits 27% along the first run, `v0.5` at the apex of the right-hand bend (`90/155`),
`current` 80% along the run between the bends, `v1.0` where the left-hand bend crosses
vertical (`65/90`), and the arrow at the drive's end. That is the whole reason a marker
can never end up beside the road: move a bend and its milestone moves with it. Measured:
every pin lands within 0.1 grid units of the drawn path. Each pin is a **gold coin
centred on its mark** — a point marker rather than a teardrop, so the place it stands
for is exactly the place it covers — and each card hangs off its pin with a `place:
'above' | 'below' | 'left' | 'right'` offset plus a `clamp()` on the horizontal position,
so a card near the canvas edge slides inward instead of overflowing while its pin stays
put.

**Fitting one screen.** The diagram is not allowed to push the page into a scroll:
the canvas is a 3:2 box sized by `clamp(300px, min(100cqh, 66.6667cqw), 620px)`, so
whichever of the height or the width runs out first sets the scale, and everything
inside it — type, padding, pins, gaps — is measured in `cqw` so the whole diagram
scales as one piece. The `100cqw / 1.5` term is what keeps the box from ever being
wider than the column it sits in.

The `cqh` half of that is deliberate, and `100%` is the trap: a percentage height
does not resolve against a flex-sized parent (the probe returned `0px`), so a
`min(100%, …)` canvas collapses to nothing. The wrapper is given a definite
`height: calc(100dvh - 345px)` *and* `container-type: size`, and the canvas reads
`100cqh` off it instead. The 345px is the chrome around the canvas — nav, heading,
intro, contact line and the roomy footer — which measures 315px at 1440 wide, so the
page lands 30px short of the fold; that slack is what stops a wrapped intro line or a
longer footer from putting the scrollbar back.

The version stops are **v0.1**, **v0.5** and **v1.0**, each a `hgd-card` button that
opens the shared `Modal` with a status badge, a paragraph and a list of items — the
teaser lives in the modal, not on the card, because the card has to fit in the
diagram. *We are here right now* is a label over the road between v0.5 and v1.0, an
arrow pointing down the road and a pulsing dot on the tarmac itself, and the road
finishes on an arrowhead the sign sits under. Below `sm` the canvas is replaced by
`RoadList`: the same milestones as a straight vertical road down the left with the
cards stacked beside it, because a 3:2 canvas on a portrait phone would be a strip
too small to read.

Like the credits, the content is hand-written rather than generated: it is a promise
to the player, not a changelog, and it is kept in step with this document — v0.5
mirrors §§26–28, and v1.0 carries the two known defects (the mid-draft rejoin
dropping a Master to spectator, and the Debate Arena bracket that never produces a
champion) plus the drafting-latency work the draft note apologises for. Coupling
*v1.0* to the bug list in `## Not done` is intentional: a roadmap that only lists
features would need a second, hidden list for the things that are broken, and the
page a player reads is the right place for both.

**The nav fits five items.** The nav was tuned for four links inside a
single-screen landing page (see §25), so the buttons drop to 11px with tighter
padding below the `sm` breakpoint and both the row and the link group are allowed
to wrap. At 360px the five links now fit one row; if a translation or a longer
label pushes them over, they wrap to a second line rather than overflowing.

---

## Verification status

| Check | Result |
|---|---|
| Node | **v24.21.0** (npm 11.19.0), installed as a verified portable build at `.tools/node`; v20 kept at `.tools/node20` for rollback |
| `npx tsc -p server/tsconfig.json --noEmit` | clean |
| `npx tsc -p client/tsconfig.json --noEmit` | clean |
| `npm run build` (client) | succeeds |
| `npm test` | **163/163** passing across 13 files (incl. 23 image-source, 10 AniList-provider, 11 character-filter, 6 narration, 6 VS Battles lookup, 9 class-affinity, 6 draft-pool and 3 fiction-tier tests) |
| `npm run images` | 198/200 fallback characters resolve to real artwork in one run; the two stragglers (Rimuru Tempest, Hela) are live-API flakiness and resolve when probed individually via `npm run oracle -- --images` |
| `npm run smoke -- --players 5 --days 5` | passes with all **10** classes drafted, one winner, 4 deaths, no unresolved tokens |
| `npm run smoke -- --mode DEBATE --players 7` | **fails** — "the debate bracket never produced a champion" (7 matches drawn, then it stalls). Reproduced on both Node 20 and Node 24, so it is not an upgrade artifact. The mode is unreachable from the lobby (disabled behind a "Coming soon" badge), so it is deferred rather than fixed |
| `npm run smoke -- --rooms 12 --players 7` | passes, peak 15 rooms / 96 players, 84 sockets |
| Name change | grep for the old name, its slug and its PascalCase form returns only this document (the two lines describing the rename); the served page reads `Grail Wars` in the title, `GRAIL WARS` on two lines as the home heading, `GW` and `Grail Wars` in the nav, and "Grail Wars is a fan-made party game" on Credits; the server logs `Grail Wars listening`; a full smoke run passes afterwards |
| Single-screen home page | `/` reports no document scroll and no inner overflow at 1440×800, 1280×720, 1280×600, 1024×600, 414×896, 375×667 and 360×640, in both the *Create* and the *Join* state (`documentElement.scrollHeight === innerHeight`); nav, hero, play controls, mode cards, footer and the `Early Access V.0.5` stamp are all inside the viewport at each size, and the stamp no longer collides with the attribution name on narrow screens. Other routes are untouched: `/credits` still yields a 1698px document with the roomier footer, `/contact` likewise, and `/room/ABCD` keeps its ordinary document scroll at 320×568 with nothing clipped (its container's `scrollHeight` equals its `clientHeight`) |
| Early-access UI | notice appears on the first load of a session (`z-60`, ending in "click anywhere to close"), is dismissed by a click on the card, a click on the backdrop corner and by Escape — all of which write `hgd:early-access-ack` to `sessionStorage` — and then stays hidden across a reload of both `/` and `/room/JNUA`; clearing session storage (or a new tab) brings it back; landing stamp renders fixed at bottom-right (8px/12px, 10px, `pointer-events: none`); in the lobby the War card is selectable with the `Recommended` badge while the Debate card reports `disabled`, `aria-disabled`, `opacity: .6`, `cursor: not-allowed` and "Coming soon", and clicking it leaves the War settings panel in place |
| Browser walkthrough | home / credits / contact render; exactly one attribution footer per route (home, credits, contact and a room URL), with the credit linking out to abhinavaagiri.com without an underline; the nav is translucent; all six credit-page logos load from `/brands`; the narration dropdown lists three styles; class toggles persist across two clients; "Let Players Choose" offers three cities and the choice sticks; draft shows one card per enabled class with a working info popup; a VS Battles pick renders real artwork rather than an initials avatar; feedback form posts and logs |
| `npm run oracle` | 9/9 within expectation against live VS Battles pages |
| `Dockerfile` (optional VM path) | **not built** — Docker is unavailable in the development environment; the free Render path builds with Node instead |
| VM deployment files (unused by the free path) | `docker-compose.yml` parses as YAML with the intended shape: two services, three named volumes, the app's port **unpublished** (`expose: 3000` only), `NODE_ENV: production` set on the service so `.env`'s development value cannot override it, an exec-form healthcheck, and Caddy publishing 80/443 with `depends_on: app: condition: service_healthy` while mounting `./Caddyfile` read-only and persisting `/data` + `/config` |
| `render.yaml` blueprint | the free path's whole configuration: `runtime: node`, `plan: free`, `buildCommand: npm ci --include=dev && npm run build`, `startCommand: npm start`, `healthCheckPath: /healthz`, `autoDeploy: true`, `NODE_VERSION: 24.21.0`, and the optional keys blank (`sync: false`). Shape checked against Render's blueprint spec here; the live deploy is what proves it (see `## Not done`) |
| C2S keepalive | instrumenting `WebSocket.prototype.send` on the production build in a browser showed `42["app:keepalive",{}]` leave the page **once per 4-minute interval while a room was on screen** (measured at 228s after the patch, with the interval mounted ~12s before it), and the server's `debug` log recorded the matching `{"playerId":"_uxLwMqeD2vC","msg":"keepalive"}` line; nothing in the room changed and the capture also shows engine-level `3` (pong) frames, the transport heartbeat every open tab already produces |
| Published site (Render free) | `https://grail-wars.onrender.com` — `/healthz` returns `{"ok":true,...}` (200 in 0.37s for the first request of the session, 0.13s for the next, so the service was already warm), `/` serves the built client with the shipped production CSP (`script-src 'self'`, `connect-src 'self' ws: wss:`) and `/room/ABCD` falls back to `index.html` with 200 |
| Live multiplayer over WSS | `BASE_URL=https://grail-wars.onrender.com npm run smoke -- --players 5 --days 5` from this machine: 5 Masters created a room over WSS, filled all 10 class slots (the duplicate pick was rejected), locked in, summoned, and the Render instance researched live wikis itself — John Wick 9-C, Aang 5-C, Altair Ibn-La'Ahad 9-A, Jeanne d'Arc 1-C, Eric Bloodaxe Low 6-B, all high confidence — then ran the war to one winner over 37 events with no unresolved tokens |
| Live keepalive over a quiet window | a room (`MCHP`) was created on the deployed site and left open in the lobby — nothing else touched the service — for 18 minutes: the deployed bundle carries `app:keepalive`, `/healthz` answered in 0.21 s and still reported `rooms: 1` (the same process still held the room — a restart would have wiped it), the lobby was still on screen with the socket connected, and the tab never reconnected, so an open room's heartbeat kept the free instance from sleeping end-to-end |
| Cold start (free plan) | after 18.5 minutes of deliberate silence the first `/healthz` request returned `200` in **32.26 s** (TCP connect in 0.06 s, transfer at 32.26 s — the edge answers at once, the instance is what is slow) and the next in 0.11 s, with the body reporting `rooms: 0` because the sleep had wiped the test room above. That is the wake-up the user saw as "30 to 40 seconds"; the sleep before it follows the documented 15-minute idle rule, and a deploy's own traffic counts, which is why the service slept roughly twenty minutes after a push |
| Production single-process path | `NODE_ENV=production npm start` logs `env: "production"` and `Grail Wars listening`; `/healthz` returns `{"ok":true,...}`; `/` serves `client/dist` with the shipped CSP (`img-src 'self' data: blob:`, `connect-src 'self' ws: wss:`); `/room/ABCD` falls back to `index.html` with 200 while an unknown `/api` path 404s; and a request carrying `Origin: http://evil.example` gets **no** `access-control-*` header — the same-origin posture both deployment paths depend on |
| `npm run smoke -- --players 5 --days 5` against the production server | passes — 5 Servants drafted, 4 deaths, one winner, no unresolved tokens |
| Production dependency set | `npm ls tsx --omit=dev` resolves `tsx@4.23.15` under `server`, so a production-only install can run `npm start`; `npm ci --dry-run` exits 0, so `package.json` and the lockfile are still in sync — which matters, because the Docker build and the Render build both run `npm ci` |
| `docker-compose.yml` / `Caddyfile` at runtime | **not run** — Docker is unavailable here; the stack, the image build and the certificate handshake are first exercised on the VM |
| Scaling rebuild | live probes of 6 canon characters resolve to their VS Battles tiers: `Saber` (AniList 497) → **Low 6-B / FTL** via *Artoria Pendragon (Saber)*, EMIYA and Cú Chulainn Low 6-B, Roronoa Zoro Low 5-B, Goku 2-C (peak policy); every one high confidence |
| Class gating | live socket checks: *Artoria Pendragon* refused as Archer (*"can only be drafted as Saber or Caster or Ruler"*), accepted as Saber; a Saber-roster pick refused as Archer (*"not on this room's Archer roster"*); all seven classes' pools reported 25/25 |
| Roster regeneration | Wikidata figure check keeps 4,781/12,058 candidates; the regenerated rosters contain none of the flagged modern figures (heads of state, a serial killer, a suicide bomber, a war criminal, living athletes, non-persons such as *Achilles' heel* — all present in the previous lists' audit set) |
| Browser walkthrough (AI Chooses) | fresh room: toggle Off by default with the pool select disabled; On enables it; all three pool values round-trip; every enabled class offers *CHOOSE FROM 25* and the chooser lists 25 mixed-roster cards; a picked card lands on the board; both Masters filled 7/7, locked in, summoned and reached Power Review — Cecilia Alcott **7-C high**, Gustav Steinhauer **9-B high** — and the war started (Budapest, both Servants alive) |
| `npm run smoke -- --players 5 --days 5` against the production server, after roster regeneration | passes — 5 Servants drafted, 4 deaths, one winner, 44 events, no unresolved tokens |
| Version stamp and the draft note | a search for `V0.1` / `V0.1` across `client/src`, `server/src`, `shared/src` and this document returns nothing; the served landing page reads `Early Access V.0.5` fixed at the bottom-right and the first-load notice badge reads `Early Access · V.0.5`; a live two-Master draft renders *"I apologize for any delay when selecting characters, I am still trying to optimize the drafter."* italic, one size down, directly under *"The host can begin once every Master has locked in."*; both are centred on the buttons' axis at 1093px and 375px (the note's box centre equals the *Begin Summoning* button's centre), wrapping to two balanced lines at the narrow width with no horizontal overflow |
| Roadmap page and the five-item nav | the nav reads `GW / PLAY / CREDITS / ROADMAP / CONTACT` in that order on `/`, `/roadmap`, `/credits` and `/contact`; `/roadmap` renders the road with the v0.1, v0.5 and v1.0 gold pins and their cards on it — every pin's centre measured onto the drawn path within 0.1 grid units, every card inside the canvas, each one opening the shared modal with its status and items (v1.0's modal opens with 6 items and fits the viewport) — plus the *We are here right now* label and dot, the arrowhead, the two dot-grid corners and the *Coming soon* sign; the five nav links share one row at 360px (every link's `top` is equal) and `/` still reports `documentElement.scrollHeight === innerHeight` at 1440×800 and 360×640 in both the create and the join state |
| The road is smooth and extruded | the road is one `<path>` in the 150×100 grid whose `d` is `M -8 20 L 104 20 A 11 11 0 0 1 108.65 40.97 L 61.52 62.95 A 11 11 0 0 0 56.2 77.56 A 11 11 0 0 1 57.23 82.21 L 57.23 83.21` — three straight runs and three circular bends that **all share `r = 11`**, each bend's start tangent equal to the heading the run before it left, so the curve contains no corner anywhere (the old spline-through-waypoints version is gone); the strokes are eight passes of that one path with the side face struck as the same path translated down by `EXTRUDE = 1.7`, the solid passes butt-capped so the slab ends in a clean cut and the arrowhead's wide base sits on it; and the dashes are the only round-capped pass |
| Roadmap fits one screen | `documentElement.scrollHeight === innerHeight` and `scrollWidth === innerWidth` on `/roadmap` at 1920×1080 (canvas 864×576), 1440×820 (713×475), 1280×720 (563×375), 1024×768 (635×423), 700×800 (668×445) and 360×740 (list) — the canvas measures exactly 1.500 at every one of them, from `min(100cqh, 66.6667cqw)` rather than `100%`, which measured `0px`. The drawn road never touches a card: sampling the path at 900 points, the nearest approach to v0.1 / v0.5 / v1.0 is **17/11/24px at the worst size (1280×720)** and 21/17/31px at 1440×820, with every card's whole box inside the canvas; the arrowhead's base meets the road's cut end, the *Coming soon* sign clears the arrowhead by 6–11px and the canvas bottom by 11–20px |
| Roadmap on a phone | at 360×740 the road canvas is `display: none` (its wrapper's `display` reads `none`, its measured width `0`) and `RoadList` takes over: four rows (v0.1, v0.5, *We are here right now*, v1.0) plus the *Coming soon* sign in a 328px list, all three coins and the marker dot centred on the 30px road column at `x = 45`, `documentElement.scrollWidth` inside the viewport, and no document scroll (740/360) |
| Feedback delivery path (local mock webhook) | with `FEEDBACK_TO` and `FEEDBACK_WEBHOOK_URL` set, `POST /api/feedback` answered `{"ok":true}` in **0.26 s**, the server logged `feedback delivered`, and a local mock webhook received the exact payload the Apps Script recipe consumes — `to`, `subject` (`Grail Wars feedback (bug)`), `name`, `replyTo`, `message`, `site`; with the webhook unset the same request answered `{"ok":true}` in **0.018 s** and logged `feedback received but no FEEDBACK_WEBHOOK_URL is configured — stored in memory only`; after the default change, grep finds no real inbox address anywhere in the working tree |
| Live feedback delivery from the deployed site | the deployed **Contact** form was submitted for real (name *Live delivery check*, reply-to `reply-test@example.com`): the page showed the toast and the *Message received* card, and `POST /api/feedback` took **3005 ms** — the same request takes about 20 ms when no webhook is configured, so Render did call `FEEDBACK_WEBHOOK_URL` and wait on Google — but no email arrived. The Apps Script's **Executions** page showed the newest entry *Completed* while its `to:` was still the recipe's placeholder (copied verbatim as `'FEEDBACK_TO@gmail.com'`), so `MailApp` mailed an address nobody owns; the deployment itself (*Execute as: Me*, access *Anyone*, `/exec` URL) and the Render environment are otherwise correct. The recipe now names the recipient on an explicit `INBOX` line and records that an edited script must be deployed as a new version. End-to-end confirmation is the next submission after that fix |

## Not done

- The `Dockerfile` is written but unbuilt, and so is the compose stack around
  it: `docker compose up`, the image build and Caddy's certificate handshake
  need their first run on a machine that has Docker. They are now the optional
  VM path rather than the published one, and Docker is not installed in the
  development environment.
- Live research with AI narration (`narration: 'ai'`) has not been exercised
  end-to-end, since no LLM key is configured — and the style is no longer
  reachable from the lobby.
- M9 polish beyond the attribution footer (sound effects, a dedicated
  accessibility pass, a recap-image export) is still open.
- Live feedback delivery through an Apps Script inbox is not confirmed yet. The
  first real submission from the deployed form did reach Google and run `doPost`
  (Executions: *Completed*), but the script still carried the recipe's placeholder
  recipient, so no mail could arrive. The acceptance test is the next submission,
  after the owner sets the inbox address and deploys a new version.
