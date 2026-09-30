import wikiMap from '../../data/fandom-wikis.json';
import { politeJson } from '../../util/http';
import { normalize, titleSimilarity } from '../../util/text';
import { htmlToLines } from '../parseVsb';

const WIKIS = wikiMap as Record<string, string>;

/** Best-guess Fandom subdomain for a source/franchise string. */
export function resolveWikiSubdomain(name: string, source: string): string | null {
  const candidates = [normalize(source), normalize(name)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (WIKIS[candidate]) return WIKIS[candidate];
    for (const [key, sub] of Object.entries(WIKIS)) {
      if (candidate.includes(key) || key.includes(candidate)) return sub;
    }
  }
  // Direct guess: "Dragon Ball Z" -> dragonballz
  const guessed = normalize(source).replace(/\s+/g, '');
  if (guessed.length >= 3 && guessed.length <= 24) return guessed;
  return null;
}

function apiUrl(subdomain: string, params: Record<string, string | number>): string {
  const url = new URL(`https://${subdomain}.fandom.com/api.php`);
  const all: Record<string, string | number> = { format: 'json', origin: '*', maxlag: 5, ...params };
  for (const [k, v] of Object.entries(all)) url.searchParams.set(k, String(v));
  return url.toString();
}

export interface FandomResult {
  title: string;
  imageUrl: string;
  extract: string;
  url: string;
}

export async function searchFandom(name: string, source: string): Promise<FandomResult[]> {
  const subdomain = resolveWikiSubdomain(name, source);
  if (!subdomain) return [];
  const url = apiUrl(subdomain, {
    action: 'query',
    generator: 'search',
    gsrsearch: name,
    gsrlimit: 5,
    prop: 'pageimages|extracts',
    piprop: 'original|thumbnail',
    pithumbsize: 600,
    exintro: 1,
    explaintext: 1,
    exsentences: 3,
  });
  try {
    const payload = await politeJson<any>(url);
    const pages = payload?.query?.pages;
    if (!pages) return [];
    return Object.values<any>(pages)
      .map((p) => ({
        title: String(p.title ?? ''),
        imageUrl: String(p.original?.source ?? p.thumbnail?.source ?? ''),
        extract: String(p.extract ?? '').replace(/\s+/g, ' ').trim(),
        url: `https://${subdomain}.fandom.com/wiki/${encodeURIComponent(String(p.title ?? '')).replace(/%20/g, '_')}`,
      }))
      .filter((r) => r.title);
  } catch {
    return [];
  }
}

export interface FandomPageText {
  title: string;
  text: string;
  url: string;
}

/** Ability/feat prose is what the power pipeline wants; the lead section is not. */
const FANDOM_SECTION_RE =
  /^(?:powers(?: and abilities)?|abilities(?: and powers)?|skills(?: and abilities)?|powers and stats|techniques|feats|equipment|fighting style)$/i;
const FANDOM_TEXT_MAX = 4000;

/** Prefer the article's powers/abilities section; otherwise the page lead. */
function pickPageText(lines: string[]): string {
  const sectionIndex = lines.findIndex((line) => FANDOM_SECTION_RE.test(line.trim()));
  const start = sectionIndex >= 0 ? sectionIndex + 1 : 0;
  return lines.slice(start, start + 90).join('\n').slice(0, FANDOM_TEXT_MAX).trim();
}

/**
 * Read a character's Fandom article rather than its three-sentence intro: the
 * powers, abilities and feats live deeper in the page, and they are what the
 * power pipeline actually needs.
 */
export async function getFandomPageText(name: string, source: string): Promise<FandomPageText | null> {
  const subdomain = resolveWikiSubdomain(name, source);
  if (!subdomain) return null;
  const results = await searchFandom(name, source).catch(() => []);
  if (!results.length) return null;
  const page = [...results].sort(
    (a, b) => titleSimilarity(name, b.title) - titleSimilarity(name, a.title),
  )[0]!;

  try {
    const url = apiUrl(subdomain, { action: 'parse', page: page.title, prop: 'text', formatversion: 2, redirects: 1 });
    const payload = await politeJson<any>(url);
    const html: string = payload?.parse?.text ?? '';
    if (html) {
      const text = pickPageText(htmlToLines(html));
      if (text.length >= 60) return { title: page.title, text, url: page.url };
    }
  } catch {
    // Fall through to the intro extract below.
  }
  return page.extract.trim().length >= 60 ? { title: page.title, text: page.extract, url: page.url } : null;
}

export async function getFandomPageImage(title: string, subdomain: string): Promise<string | null> {
  const url = apiUrl(subdomain, {
    action: 'query',
    titles: title,
    prop: 'pageimages',
    piprop: 'original|thumbnail',
    pithumbsize: 600,
    redirects: 1,
  });
  try {
    const payload = await politeJson<any>(url);
    const pages = payload?.query?.pages;
    if (!pages) return null;
    const first = Object.values<any>(pages)[0];
    return first?.original?.source ?? first?.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}
