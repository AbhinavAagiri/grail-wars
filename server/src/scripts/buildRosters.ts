/**
 * Build the AI-Chooses draft rosters.
 *
 * The game ships two curated rosters — one of anime/manga characters, one of
 * historical and legendary figures — each with a list per Servant class. They
 * are generated here from public wiki category data (VS Battles' own class
 * categories for anime; Wikipedia's category trees for history), then committed
 * so the game itself never needs the network to deal a draft.
 *
 *   npx tsx src/scripts/buildRosters.ts
 *
 * The output is `src/data/roster-anime.json` and `src/data/roster-history.json`,
 * each `{ [class]: [{ name, source }] }`, most recognisable first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CLASSES, type ServantClass } from '@hgd/shared';
import fallbackCharacters from '../data/fallback-characters.json';

const OUT_DIR = path.resolve(process.cwd(), 'src/data');
const PER_CLASS = 250;
/** How many category members to read per class category (paged, 500 each). */
const MAX_PAGES = 4;

const USER_AGENT = 'GrailWarsRosterBuilder/1.0 (https://github.com/AbhinavAagiri/grail-wars)';

/* ------------------------------------------------------------------ */
/* Fetch cache — re-runs are cheap and a rate-limited run resumes       */
/* ------------------------------------------------------------------ */

interface FetchCache {
  pages: Record<string, string[]>;
  subcats: Record<string, string[]>;
  weights: Record<string, number>;
  /**
   * Wikipedia title → its Wikidata item: P31 instance-of ids plus the birth
   * and death years the modern-era filter needs. `vital` marks records fetched
   * since the vitals were added; older cache entries get one refetch.
   */
  entities?: Record<
    string,
    { qid: string; p31: string[]; born?: number | null; died?: number | null; vital?: boolean }
  >;
  /** Wikidata id → English label, for P31 values. */
  labels?: Record<string, string>;
}

const CACHE_FILE = path.resolve(process.cwd(), '.cache/roster-fetch.json');

function loadCache(): FetchCache {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as FetchCache;
  } catch {
    return { pages: {}, subcats: {}, weights: {} };
  }
}

const cache = loadCache();
cache.entities ??= {};
cache.labels ??= {};
let cacheDirty = false;

function saveCache(): void {
  if (!cacheDirty) return;
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8');
    cacheDirty = false;
  } catch {
    // The cache is an optimisation; never fail the build over it.
  }
}

interface Entry {
  name: string;
  source: string;
  /** page length, used to sort the most substantial (read: recognisable) first */
  weight?: number;
}

interface Seed {
  category: string;
  source: string;
}

/* ------------------------------------------------------------------ */
/* Anime roster: VS Battles categories                                  */
/* ------------------------------------------------------------------ */

/** VS Battles category names per class; missing ones are skipped. */
const VSB_CLASS_CATEGORIES: Record<ServantClass, string[]> = {
  saber: ['Sword Users'],
  archer: ['Bow Users', 'Gun Users', 'Snipers', 'Marksmen'],
  lancer: ['Spear Users'],
  rider: ['Riders', 'Horse Users', 'Ship Users', 'Pilots', 'Chariot Users'],
  caster: ['Magic Users', 'Mages', 'Necromancers', 'Alchemists', 'Scientists'],
  assassin: ['Assassins', 'Ninjas', 'Spies', 'Poison Users'],
  berserker: ['Berserkers', 'Monsters', 'Oni', 'Vampires'],
  shielder: ['Shield Users'],
  ruler: ['Kings', 'Queens', 'Emperors', 'Deities', 'Rulers'],
  avenger: ['Avengers', 'Vengeance Users', 'Curse Users', 'Revenge Users'],
};

/** Categories that mark a page as a character from drawn media. */
const VSB_ANIME_CATEGORIES = [
  'Anime Characters',
  'Manga Characters',
  'Light Novel Characters',
  'Visual Novel Characters',
  'Manhwa Characters',
  'Web Novel Characters',
];

/* ------------------------------------------------------------------ */
/* History roster: Wikipedia categories                                 */
/* ------------------------------------------------------------------ */

const HISTORY_SEEDS: Record<ServantClass, Seed[]> = {
  saber: [
    { category: 'Medieval knights', source: 'History' },
    { category: 'Samurai', source: 'History' },
    { category: 'Knights', source: 'History' },
    { category: 'Greek mythological heroes', source: 'Greek mythology' },
    { category: 'Legendary people', source: 'Legend' },
  ],
  archer: [
    { category: 'Archers', source: 'History' },
    { category: 'Sharpshooters', source: 'History' },
    { category: 'Military snipers', source: 'History' },
    { category: 'Bowmen', source: 'History' },
    { category: 'Greek mythological heroes', source: 'Greek mythology' },
  ],
  lancer: [
    { category: 'Spearmen', source: 'History' },
    { category: 'Pikemen', source: 'History' },
    { category: 'Phalangites', source: 'History' },
    { category: 'Javelin throwers', source: 'History' },
    { category: 'Greek mythological heroes', source: 'Greek mythology' },
    { category: 'Legendary people', source: 'Legend' },
  ],
  rider: [
    { category: 'Cavalry', source: 'History' },
    { category: 'Explorers', source: 'History' },
    { category: 'Circumnavigators', source: 'History' },
    { category: 'Admirals', source: 'History' },
    { category: 'Equestrians', source: 'History' },
  ],
  caster: [
    { category: 'Philosophers', source: 'History' },
    { category: 'Scientists', source: 'History' },
    { category: 'Physicians', source: 'History' },
    { category: 'Mathematicians', source: 'History' },
    { category: 'Astronomers', source: 'History' },
    { category: 'Inventors', source: 'History' },
    { category: 'Mythological kings', source: 'Mythology' },
  ],
  // Wikipedia's "Assassins", "Poisoners" and "Conspirators" trees are
  // perpetrator lists — contract killers, the sarin attackers, coup plotters.
  // Ninja and Spies give the class its historical names without them.
  assassin: [
    { category: 'Ninja', source: 'History' },
    { category: 'Spies', source: 'History' },
    { category: 'Iga ikki', source: 'History' },
  ],
  berserker: [
    { category: 'Gladiators', source: 'History' },
    { category: 'Warriors', source: 'History' },
    { category: 'Norse mythology', source: 'Norse mythology' },
    { category: 'Greek mythology', source: 'Greek mythology' },
    { category: 'Mythological monsters', source: 'Mythology' },
  ],
  shielder: [
    { category: 'Bodyguards', source: 'History' },
    { category: 'Spartans', source: 'History' },
    { category: 'Guards', source: 'History' },
    { category: 'Mythological kings', source: 'Mythology' },
  ],
  ruler: [
    { category: 'Monarchs', source: 'History' },
    { category: 'Emperors', source: 'History' },
    { category: 'Pharaohs', source: 'History' },
    { category: 'Saints', source: 'History' },
    { category: 'Mythological kings', source: 'Mythology' },
  ],
  // "Vigilantes" reaches death squads and "Murder victims" reaches "Murderers
  // by victim", so only revolutionaries, rebels and mythology are read here.
  avenger: [
    { category: 'Revolutionaries', source: 'History' },
    { category: 'Rebels', source: 'History' },
    { category: 'Greek mythology', source: 'Greek mythology' },
  ],
};

/**
 * The hand-picked core the game already shipped as its offline fallback list is
 * class-tagged and curated, so it seeds both rosters at the top (its characters
 * also become the curated class map the draft gate trusts).
 */
/**
 * Exactly the labels the game gives real-world characters. Matching on a
 * substring mis-filed "The Legend of Zelda" as history — it merely contains
 * the word "legend".
 */
const REAL_WORLD_SOURCES = new Set([
  'history',
  'historical',
  'ancient',
  'mythology',
  'myth',
  'legend',
  'folklore',
  'real life',
  'mahabharata',
  'arthurian legend',
  'greek mythology',
  'norse mythology',
  'irish mythology',
  'celtic mythology',
  'egyptian mythology',
  'swiss legend',
  'german legend',
  'english folklore',
  'slavic folklore',
]);
const DRAWN_SOURCE_RE =
  /anime|manga|one piece|naruto|bleach|demon slayer|jujutsu kaisen|fairy tail|hunter x hunter|attack on titan|sword art online|fullmetal alchemist|gurren lagann|konosuba|overlord|rurouni kenshin|berserk|akame ga kill|fire force|genshin|dragon ball|jojo|spy x family|chainsaw man|tokyo ghoul|evangelion|nausicaa|kino|my hero academia|pokemon|sailor moon|inuyasha|black clover|re:zero|re zero|vinland saga|hellsing|mob psycho|rwby|avatar|naruto|akira|gundam/i;

function coreEntries(kind: 'anime' | 'history'): Record<ServantClass, Entry[]> {
  const table = fallbackCharacters as unknown as Record<string, { name: string; source: string }[]>;
  const out = {} as Record<ServantClass, Entry[]>;
  for (const cls of CLASSES) {
    out[cls] = [];
    for (const entry of table[cls] ?? []) {
      const source = String(entry?.source ?? '');
      const matches =
        kind === 'history' ? REAL_WORLD_SOURCES.has(source.toLowerCase()) : DRAWN_SOURCE_RE.test(source);
      if (!entry?.name || !matches) continue;
      // Above any wiki page length, so the hand-picked core always leads the
      // class list (and the pool samples from the head of that list).
      out[cls].push({ name: entry.name, source: entry.source, weight: 10_000_000 });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Fetch helpers                                                        */
/* ------------------------------------------------------------------ */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polite fetch with backoff. Public wikis rate-limit long crawls — a 429 or a
 * 5xx is retried rather than silently treated as "this category is empty",
 * which is how a run once produced a 2-character assassin roster.
 */
async function json(url: string, attempts = 3): Promise<any | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await sleep(150);
    try {
      const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (!res.ok) return null;
      return (await res.json()) as any;
    } catch {
      await sleep(800 * (attempt + 1));
    }
  }
  console.warn(`  ! giving up on ${url.slice(0, 120)}`);
  return null;
}

/** All (paged) category members of a MediaWiki category. */
async function categoryMembers(api: string, category: string, maxPages = MAX_PAGES): Promise<string[]> {
  const out: string[] = [];
  let cont: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(api);
    url.searchParams.set('action', 'query');
    url.searchParams.set('list', 'categorymembers');
    url.searchParams.set('cmtitle', `Category:${category}`);
    url.searchParams.set('cmlimit', '500');
    url.searchParams.set('cmnamespace', '0');
    url.searchParams.set('format', 'json');
    url.searchParams.set('formatversion', '2');
    if (cont) url.searchParams.set('cmcontinue', cont);
    const payload = await json(url.toString());
    const members = payload?.query?.categorymembers;
    if (!Array.isArray(members)) break;
    for (const member of members) {
      const title = String(member?.title ?? '').trim();
      if (title) out.push(title);
    }
    cont = payload?.continue?.cmcontinue;
    if (!cont || members.length < 500) break;
  }
  return out;
}

/**
 * Maintenance and meta categories that never contain characters — plus the
 * categories that only ever contain trouble. Wikipedia's "Assassins" tree
 * reaches contract killers and mass shooters, "Poisoners" reaches the Tokyo
 * sarin attackers and "Vigilantes" reaches death squads, so those branches are
 * pruned before a single name is read.
 */
const SKIP_SUBCAT_RE =
  /\b(?:articles|cs1|webarchive|commons|use dmy|use mdy|short description|all articles|wikipedia|lists?|templates?|categories|stubs|infobox|portal|redirects|disambiguation|images|files|navboxes|tracking|cleanup|sources|references)\b|\b(?:murder|killing|killers?|assassination|perpetrator|terror|bombing|shooting|shooters?|massacre|atrocit|genocide|holocaust|slavery|slave|victims?|crime|criminal|convict|prisoner|executed|torture|rape|abuse|nazi|neo-nazi|fascis|falangis|supremac|extremis|racis|jihad|taliban|islamic state|al-qaeda|insurgen|militia|paramilitar|death squad|cartel|gang|mafia|mobster|drug|fraud|kidnapp|prostitut|sex worker|human traffic|cult|sect|suicide|serial kill|contract kill|mass murder|war crime|\bdeaths?\b|cause of death|members$)\b|\b(?:fictional|fiction|depictions?|popular culture|in cinema|in television|in comics|in video games|themes?|mythology of|myths?\b|metamorphoses|places?|objects?|artifacts?|ships?|arts?\b|books?|works?|events?\b|rituals?|cults?|sanctuaries|temples?|vases?|pottery|coins?|heraldry|sculptures?|paintings?|architecture|oracles?|tombs?|afterlife|underworld|cosmology|theogony|category named after|wikiproject|by continent|by nationality|by ethnicity|by religion|by period|by century|by country|by field|by institution|by populated place|by tradition)\b/i;

const deepCategoryCache = new Map<string, string[]>();

/** Members *and* subcategory names of a category. */
async function categoryMembersAndSubcats(
  api: string,
  category: string,
  maxPages: number,
): Promise<{ pages: string[]; subcats: string[] }> {
  const cacheKey = `${api}|${category}|${maxPages}`;
  const cachedPages = cache.pages[cacheKey];
  const cachedSubcats = cache.subcats[cacheKey];
  if (cachedPages && cachedSubcats) {
    return { pages: cachedPages, subcats: cachedSubcats };
  }

  const pages: string[] = [];
  const subcats: string[] = [];
  let cont: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(api);
    url.searchParams.set('action', 'query');
    url.searchParams.set('list', 'categorymembers');
    url.searchParams.set('cmtitle', `Category:${category}`);
    url.searchParams.set('cmtype', 'page|subcat');
    url.searchParams.set('cmlimit', '500');
    url.searchParams.set('format', 'json');
    url.searchParams.set('formatversion', '2');
    if (cont) url.searchParams.set('cmcontinue', cont);
    const payload = await json(url.toString());
    const members = payload?.query?.categorymembers;
    if (!Array.isArray(members)) break;
    for (const member of members) {
      const title = String(member?.title ?? '').trim();
      if (!title) continue;
      if (member?.ns === 14) subcats.push(title.replace(/^Category:/, ''));
      else pages.push(title);
    }
    cont = payload?.continue?.cmcontinue;
    if (!cont || members.length < 500) break;
  }
  if (pages.length || subcats.length) {
    cache.pages[cacheKey] = pages;
    cache.subcats[cacheKey] = subcats;
    cacheDirty = true;
    saveCache();
  }
  return { pages, subcats };
}

/**
 * Walk a category and a bounded amount of its subcategory tree. Wikipedia's
 * "Scientists" is a container category with one member and fifty subcategories;
 * the people live one level down.
 */
async function categoryMembersDeep(
  api: string,
  category: string,
  { depth = 2, cap = 600, fetchBudget = 18 }: { depth?: number; cap?: number; fetchBudget?: number } = {},
): Promise<string[]> {
  const cacheKey = `${api}|${category}|${depth}|${cap}`;
  const cached = deepCategoryCache.get(cacheKey);
  if (cached) return cached;

  const seen = new Set<string>();
  const pages = new Set<string>();
  let budget = fetchBudget;
  let frontier = [category];
  for (let level = 0; level <= depth; level++) {
    const next: string[] = [];
    for (const cat of frontier) {
      if (budget <= 0 || seen.has(cat) || pages.size >= cap) continue;
      seen.add(cat);
      budget--;
      const { pages: found, subcats } = await categoryMembersAndSubcats(api, cat, level === 0 ? 2 : 1);
      for (const title of found) {
        if (isJunkTitle(title)) continue;
        pages.add(title);
      }
      if (level < depth) {
        for (const sub of subcats) if (!SKIP_SUBCAT_RE.test(sub) && !seen.has(sub)) next.push(sub);
      }
    }
    frontier = next;
    if (!frontier.length || pages.size >= cap) break;
  }
  const result = [...pages].slice(0, cap);
  deepCategoryCache.set(cacheKey, result);
  return result;
}

/** Page byte length per title — a decent "how substantial is this page" proxy. */
async function pageWeights(api: string, titles: string[]): Promise<Map<string, number>> {
  const weights = new Map<string, number>();
  const missing = titles.filter((title) => cache.weights[`${api}|${title}`] === undefined);
  for (const title of titles) {
    const stored = cache.weights[`${api}|${title}`];
    if (stored !== undefined) weights.set(title, stored);
  }
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    const url = new URL(api);
    url.searchParams.set('action', 'query');
    url.searchParams.set('titles', batch.join('|'));
    url.searchParams.set('prop', 'info');
    url.searchParams.set('format', 'json');
    url.searchParams.set('formatversion', '2');
    const payload = await json(url.toString());
    const pages = payload?.query?.pages;
    if (!Array.isArray(pages)) continue;
    for (const page of pages) {
      const title = String(page?.title ?? '');
      const length = Number(page?.length ?? 0);
      if (!title || !Number.isFinite(length)) continue;
      weights.set(title, length);
      cache.weights[`${api}|${title}`] = length;
      cacheDirty = true;
    }
    saveCache();
  }
  return weights;
}

/* ------------------------------------------------------------------ */
/* Title hygiene                                                        */
/* ------------------------------------------------------------------ */

/**
 * Lists, galleries, categories and bare model numbers are never characters.
 * VS Battles also tags whole factions and armies with its character categories,
 * which is how "Alvarez Empire" reached a draft — organisations are dropped by
 * name.
 */
const JUNK_TITLE_RE =
  /\b(?:list of|timeline|gallery|category|template|disambiguation|film|movie|series|episode|chapter|volume|soundtrack|video game|novel|manga|anime)\b|\b(?:empire|kingdom|clan|guild|organization|organisation|army|navy|nation|faction|team|school|academy|institute|company|corporation|agency|bureau|tribe|country|city|village)\b/i;

/**
 * People who should never be dealt as a Servant. Wikipedia's history categories
 * reach dictators, terrorists and killers; the category filters above prune the
 * branches, and this list is the final net over names.
 */
const DENY_NAME_RE =
  /(?:hitler|adolf|stalin|lenin|trotsky|mao zedong|pol pot|mussolini|franco|salazar|saddam hussein|gaddafi|osama bin laden|bin laden|kim il-sung|kim jong|ayatollah khomeini|al-assad|castro|che guevara|pinochet|perón|breivik|dylann roof|jim jones|charles manson|ted kaczynski|timothy mcveigh|lee harvey oswald|wilkes booth|gavrilo princip|mark david chapman|luigi mangione|eric harris|dylan klebold|jack ruby|mehmet ali|tarrant|koresh|asahara|applewhite|fred phelps)/i;

/**
 * Works, places, organisations and events are not people. Wikipedia's category
 * trees mix them in ("Inventors" reaches "Jurassic Park"), so titles carrying
 * these words are dropped from the history roster.
 */
const NON_PERSON_RE =
  /\b(?:park|wars?|trek|chronicles|saga|game|games|world|worlds|city|town|county|province|kingdom|republic|empire|dynasty|university|college|institute|academy|school|company|corporation|inc|foundation|museum|prize|award|cup|trophy|championship|festival|journal|magazine|newspaper|book|novel|album|song|band|film|movie|show|television|network|channel|airport|station|hospital|club|team|army|navy|battle|siege|war|treaty|revolution|civilization|period|era|century|mythology|religion|church|cathedral|castle|temple|pyramid|planet|moon|\bstars?\b|comet|galaxy|species|genus|family|sons? of|daughters? of|brothers? of|sisters? of|pseudo-|\band\b|\d{3,4})\b/i;

function isJunkTitle(title: string): boolean {
  if (!title || title.length < 2) return true;
  if (title.includes('/') || title.startsWith('User:') || title.includes(':')) return true;
  if (/^[A-Z0-9-]{1,6}$/.test(title)) return true; // "A-10", "AK-47"
  if (JUNK_TITLE_RE.test(title)) return true;
  return false;
}

function isNonPersonTitle(title: string): boolean {
  return NON_PERSON_RE.test(title);
}

/** Version/class markers that should not be mistaken for a character's work. */
const VERSION_MARKER_RE =
  /\b(?:part|arc|saga|era|chapter|season|episode|movie|film|anime|manga|novel|game|original|canon|classic|current|base|pre|post|new|young|old|prime|full|final|resurrected|eos|timeskip|awakened|saber|archer|lancer|rider|caster|assassin|berserker|shielder|ruler|avenger|real life|real world)\b/i;

/** "Artoria Pendragon (Saber)" → name + a source that is not just a version. */
function splitTitle(title: string): { name: string; source: string | null } {
  const match = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(title);
  if (!match) return { name: title.trim(), source: null };
  const name = (match[1] ?? '').trim() || title.trim();
  const qualifier = (match[2] ?? '').trim();
  if (!qualifier || VERSION_MARKER_RE.test(qualifier)) return { name, source: null };
  return { name, source: qualifier };
}

/* ------------------------------------------------------------------ */
/* Figure check (history)                                               */
/* ------------------------------------------------------------------ */

/** Wikidata: human. */
const HUMAN_QID = 'Q5';

/**
 * A Grail War summons spirits of the past, so a category-derived human must
 * have died before the modern era. The core fallback roster still carries the
 * modern names worth keeping (Simo Häyhä and the like).
 */
const HUMAN_DIED_BEFORE = 1945;

/**
 * Figure labels that survive without dates: legends, gods and monsters are
 * timeless, while a plain human needs a death year before HUMAN_DIED_BEFORE.
 * Achilles is a mythological character, William Tell a folklore character,
 * Heracles a demigod.
 */
const LEGEND_P31_RE =
  /mythical|mythological|mythic|mythology|legendary|legend\b|folklore|folk\b|deity|\bgods?\b|goddess|demigod|titan|nymph|angel|demon|devil|jinn|spirit|valkyrie|monster|dragon|\bhero(?:es|ine)?\b|warg|being\b/i;

/** P569/P570 store one claim; parse its year (negative for BCE), if any. */
function claimYear(claims: any, prop: string): number | null {
  const claim = Array.isArray(claims?.[prop]) ? claims[prop][0] : null;
  const time = claim?.mainsnak?.datavalue?.value?.time;
  const match = typeof time === 'string' ? /^([+-])(\d+)/.exec(time) : null;
  return match ? (match[1] === '-' ? -1 : 1) * parseInt(match[2], 10) : null;
}

/**
 * Instance-of labels that mean "not a person", and win over anything else:
 * places, monuments, groups, works and disambiguation pages all live in the
 * same category trees as the heroes.
 */
const NON_FIGURE_P31_RE =
  /disambiguation|\bgroup\b|monument|sculpture|building|structure|\bplace\b|\bsite\b|organization|organisation|company|corporation|\bwork\b|\bbook\b|taxon|species|genus|practice|concept|\bevent\b|island|mountain|river|\bcity\b|country|language|\bobject\b|dynasty|fossil|crater|archaeological|mythology of|\bmotif\b|\bidiom\b|\bentity\b|artistic theme|\bepisode\b|pseudo|pseudonym|pen name|collective/i;

/**
 * Wikipedia's category trees leak fictional characters, taxa, places and
 * topics into "people" categories — rosters once contained Jurassic Park, Tony
 * Stark, Snake Island and a sculpture garden. Every title is resolved to its
 * Wikidata item, and only people and legendary figures survive. Category-derived
 * humans must have died before the modern era: the trees otherwise reach today's
 * news cycle (living athletes, current heads of state, fresh convicts).
 */
async function filterRealFigures(titles: string[]): Promise<Set<string>> {
  const accepted = new Set<string>();
  const wikimediaApi = 'https://en.wikipedia.org/w/api.php';
  const wikidataApi = 'https://www.wikidata.org/w/api.php';

  // 1. Resolve the titles that are not cached yet to Wikidata items.
  const missingQids = titles.filter((title) => !cache.entities![title]);
  for (let i = 0; i < missingQids.length; i += 50) {
    const batch = missingQids.slice(i, i + 50);
    const url = new URL(wikimediaApi);
    url.searchParams.set('action', 'query');
    url.searchParams.set('titles', batch.join('|'));
    url.searchParams.set('prop', 'pageprops');
    url.searchParams.set('redirects', '1');
    url.searchParams.set('format', 'json');
    url.searchParams.set('formatversion', '2');
    const payload = await json(url.toString());
    const byTitle = new Map<string, { qid: string; p31: string[] }>();
    for (const page of payload?.query?.pages ?? []) {
      const title = String(page?.title ?? '');
      const qid = String(page?.pageprops?.wikibase_item ?? '');
      if (title) byTitle.set(title, { qid, p31: [] });
    }
    // Follow normalisations and redirects back to the requested titles.
    const alias = new Map<string, string>();
    for (const row of payload?.query?.normalized ?? []) alias.set(row.from, row.to);
    for (const row of payload?.query?.redirects ?? []) alias.set(row.from, row.to);
    for (const title of batch) {
      const resolved = alias.get(alias.get(title) ?? title) ?? title;
      const entity = byTitle.get(resolved);
      cache.entities![title] = entity ?? { qid: '', p31: [] };
    }
    cacheDirty = true;
    saveCache();
  }

  // 2. Fetch the claims (instance-of, birth, death) we do not have yet.
  const missingClaims = titles.filter((title) => {
    const entity = cache.entities![title];
    return Boolean(entity?.qid) && !entity?.vital;
  });
  const qidList = [...new Set(missingClaims.map((title) => cache.entities![title]!.qid))];
  for (let i = 0; i < qidList.length; i += 40) {
    const batch = qidList.slice(i, i + 40);
    const url = new URL(wikidataApi);
    url.searchParams.set('action', 'wbgetentities');
    url.searchParams.set('ids', batch.join('|'));
    url.searchParams.set('props', 'claims');
    url.searchParams.set('format', 'json');
    url.searchParams.set('formatversion', '2');
    const payload = await json(url.toString());
    const claimsByQid = new Map<string, { p31: string[]; born: number | null; died: number | null }>();
    for (const [id, entity] of Object.entries<any>(payload?.entities ?? {})) {
      const claims = entity?.claims ?? {};
      const instances = Array.isArray(claims?.P31) ? claims.P31 : [];
      const p31 = instances
        .map((claim: any) => String(claim?.mainsnak?.datavalue?.value?.id ?? ''))
        .filter(Boolean);
      claimsByQid.set(id, { p31, born: claimYear(claims, 'P569'), died: claimYear(claims, 'P570') });
    }
    for (const title of missingClaims) {
      const qid = cache.entities![title]!.qid;
      const claims = claimsByQid.get(qid);
      if (!claims) continue;
      const entity = cache.entities![title]!;
      entity.p31 = claims.p31;
      entity.born = claims.born;
      entity.died = claims.died;
      entity.vital = true;
    }
    cacheDirty = true;
    saveCache();
  }

  // 3. Labels for every instance-of value we have not seen.
  const p31Ids = [...new Set(titles.flatMap((title) => cache.entities![title]?.p31 ?? []))].filter(
    (id) => cache.labels![id] === undefined,
  );
  for (let i = 0; i < p31Ids.length; i += 40) {
    const batch = p31Ids.slice(i, i + 40);
    const url = new URL(wikidataApi);
    url.searchParams.set('action', 'wbgetentities');
    url.searchParams.set('ids', batch.join('|'));
    url.searchParams.set('props', 'labels');
    url.searchParams.set('languages', 'en');
    url.searchParams.set('format', 'json');
    url.searchParams.set('formatversion', '2');
    const payload = await json(url.toString());
    for (const [id, entity] of Object.entries<any>(payload?.entities ?? {})) {
      cache.labels![id] = entity?.labels?.en?.value ?? '';
    }
    cacheDirty = true;
    saveCache();
  }

  // 4. Judge: people and legendary figures in, everything else out.
  const droppedModern: string[] = [];
  for (const title of titles) {
    const entity = cache.entities![title];
    if (!entity?.qid || !entity.vital) continue;
    const instances = entity.p31.map((id) => cache.labels![id] ?? '');
    if (instances.some((label) => NON_FIGURE_P31_RE.test(label))) continue;
    const isHuman = entity.p31.includes(HUMAN_QID);
    const isLegend = instances.some((label) => LEGEND_P31_RE.test(label));
    if (!isHuman && !isLegend) continue;
    // Legends, gods and monsters have no dates and are exempt; a plain human
    // must have died before the modern era or the roster reaches today's
    // news cycle (and the traps already listed in DENY_NAME_RE).
    if (isHuman && !isLegend && (entity.died == null || entity.died >= HUMAN_DIED_BEFORE)) {
      droppedModern.push(`${title} (${entity.died ?? 'no death date'})`);
      continue;
    }
    accepted.add(title);
  }
  console.log(`  figure check: ${accepted.size}/${titles.length} kept`);
  if (droppedModern.length) {
    console.log(
      `  kept out ${droppedModern.length} modern/undated humans, e.g. ${droppedModern.slice(0, 10).join('; ')}`,
    );
  }
  return accepted;
}


/* ------------------------------------------------------------------ */
/* Builders                                                             */
/* ------------------------------------------------------------------ */

async function buildAnimeRoster(): Promise<Record<ServantClass, Entry[]>> {
  const api = 'https://vsbattles.fandom.com/api.php';
  const core = coreEntries('anime');
  console.log('anime: reading drawn-media character categories…');
  const animeSet = new Set<string>();
  for (const category of VSB_ANIME_CATEGORIES) {
    const members = await categoryMembers(api, category);
    for (const title of members) animeSet.add(title);
    console.log(`  ${category}: ${members.length}`);
  }

  const roster = {} as Record<ServantClass, Entry[]>;
  for (const cls of CLASSES) {
    const titles = new Set<string>();
    for (const category of VSB_CLASS_CATEGORIES[cls]) {
      const members = await categoryMembers(api, category);
      let kept = 0;
      for (const title of members) {
        if (!animeSet.has(title) || isJunkTitle(title)) continue;
        titles.add(title);
        kept++;
      }
      console.log(`  [${cls}] ${category}: ${members.length} members, ${kept} anime`);
    }
    const list = [...titles];
    const weights = await pageWeights(api, list);
    const entries: Entry[] = list.map((title) => {
      const { name, source } = splitTitle(title);
      return { name, source: source ?? 'Anime / Manga', weight: weights.get(title) ?? 0 };
    });
    entries.push(...(core[cls] ?? []));
    roster[cls] = dedupe(entries).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, PER_CLASS);
  }
  return roster;
}

async function buildHistoryRoster(): Promise<Record<ServantClass, Entry[]>> {
  const api = 'https://en.wikipedia.org/w/api.php';
  const core = coreEntries('history');
  const byClass = new Map<ServantClass, Map<string, Seed>>();

  for (const cls of CLASSES) {
    const byTitle = new Map<string, Seed>();
    for (const seed of HISTORY_SEEDS[cls]) {
      const members = await categoryMembersDeep(api, seed.category);
      let kept = 0;
      for (const title of members) {
        if (byTitle.has(title)) continue;
        byTitle.set(title, seed);
        kept++;
      }
      console.log(`  [${cls}] ${seed.category}: ${members.length} pages, ${kept} kept`);
    }
    byClass.set(cls, byTitle);
  }

  // One verification pass for the whole set: humans survive because they are
  // human, and mythological/legendary figures survive through their instance-of
  // labels. Places, groups, works and disambiguation pages do not.
  const historyTitles = new Set<string>();
  for (const map of byClass.values()) {
    for (const title of map.keys()) historyTitles.add(title);
  }
  const figures = await filterRealFigures([...historyTitles]);

  const roster = {} as Record<ServantClass, Entry[]>;
  for (const cls of CLASSES) {
    const byTitle = byClass.get(cls) ?? new Map<string, Seed>();
    const titles = [...byTitle.keys()];
    const weights = await pageWeights(api, titles);
    const entries: Entry[] = titles
      .filter((title) => figures.has(title))
      .filter((title) => !DENY_NAME_RE.test(title))
      .map((title) => {
        const { name } = splitTitle(title);
        const source = byTitle.get(title)?.source ?? 'History';
        return { name, source, weight: weights.get(title) ?? 0 };
      })
      // Judge the name, not the wiki disambiguator: "Achilles (mythology)" is a
      // person even though the parenthetical is a topic word.
      .filter((entry) => !isNonPersonTitle(entry.name));
    entries.push(...(core[cls] ?? []));
    roster[cls] = dedupe(entries).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, PER_CLASS);
  }
  return roster;
}

/** Deduplicate by normalised name, keeping the best-weighted entry. */
function dedupe(entries: Entry[]): Entry[] {
  const byName = new Map<string, Entry>();
  for (const entry of entries) {
    const key = entry.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing || (entry.weight ?? 0) > (existing.weight ?? 0)) byName.set(key, entry);
  }
  return [...byName.values()];
}

function writeRoster(file: string, roster: Record<ServantClass, Entry[]>): void {
  const clean: Record<string, { name: string; source: string }[]> = {};
  for (const cls of CLASSES) {
    clean[cls] = (roster[cls] ?? []).map((entry) => ({ name: entry.name, source: entry.source }));
  }
  const target = path.join(OUT_DIR, file);
  fs.writeFileSync(target, `${JSON.stringify(clean, null, 2)}\n`, 'utf8');
  const counts = CLASSES.map((cls) => `${cls}:${clean[cls]!.length}`).join(' ');
  console.log(`wrote ${target}\n  ${counts}`);
}

async function main(): Promise<void> {
  const anime = await buildAnimeRoster();
  writeRoster('roster-anime.json', anime);
  const history = await buildHistoryRoster();
  writeRoster('roster-history.json', history);
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
