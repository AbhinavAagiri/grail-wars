import wikiMap from '../../data/fandom-wikis.json';
import { politeJson } from '../../util/http';
import { normalize } from '../../util/text';

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
